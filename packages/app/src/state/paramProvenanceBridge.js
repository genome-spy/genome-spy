import { html } from "lit";
import { ActionCreators } from "redux-undo";
import {
    asSelectionConfig,
    createIntervalSelection,
    getEncodingKeyFields,
    getPointSelectionKeyTuples,
    isActiveIntervalSelection,
    isIntervalSelection,
    isIntervalSelectionConfig,
    isMultiPointSelection,
    isPointSelectionConfig,
    isSinglePointSelection,
    resolvePointSelectionFromKeyTuples,
} from "@genome-spy/core/selection/selection.js";
import {
    getBookmarkableParams,
    makeParamSelectorKey,
    resolveViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import {
    getDefaultParamValue,
    isSelectionParameter,
    isVariableParameter,
} from "@genome-spy/core/view/paramMediator.js";
import { field } from "@genome-spy/core/utils/field.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";
import { subscribeTo, withMicrotask } from "./subscribeTo.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";

/**
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} ParamSelector
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("@genome-spy/core/spec/parameter.js").Parameter} Parameter
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {{ type: "value", value: any }} ParamValueLiteral
 * @typedef {{ type: "interval", intervals: Partial<Record<"x" | "y", [number, number] | [import("@genome-spy/core/spec/genome.js").ChromosomalLocus, import("@genome-spy/core/spec/genome.js").ChromosomalLocus] | null>> }} ParamValueInterval
 * @typedef {{ type: "point", keyField: string, keys: Scalar[] }} ParamValuePoint
 * @typedef {ParamValueLiteral | ParamValueInterval | ParamValuePoint} ParamValue
 * @typedef {{ type: "datum", view: ViewSelector, keyField: string, key: Scalar, intervalSources?: Record<string, { start?: string, end?: string }> }} ParamOrigin
 * @typedef {{ selector: ParamSelector, value: ParamValue, origin?: ParamOrigin }} ParamProvenanceEntry
 * @typedef {{ view: View, param: Parameter, selector: ParamSelector }} BookmarkableParamEntry
 */

export default class ParamProvenanceBridge {
    /**
     * Bridges Core param state (ParamMediator) with App provenance.
     *
     * Rationale:
     * - Params live in the view hierarchy, not in Redux, so provenance needs a
     *   dedicated adapter to serialize param changes into actions and replay
     *   them back into ParamMediators.
     * - This keeps the Core lean while still allowing undo/redo and bookmarks
     *   to capture user-adjustable params (selection and bound inputs).
     * - Suppression is necessary to avoid feedback loops when replaying history.
     *
     * Constraints:
     * - Only bookmarkable params are tracked (selection + bound variable params).
     * - Point selections use stable data keys (`encoding.key`), not `_uniqueId`.
     * - If resolution fails (missing params/keys/data), warn and fall back to
     *   defaults so the visualization remains usable.
     */
    /** @type {View} */
    #root;

    /** @type {import("@reduxjs/toolkit").EnhancedStore<any>} */
    #store;

    /** @type {import("./intentExecutor.js").default<any>} */
    #intentExecutor;

    /** @type {BookmarkableParamEntry[]} */
    #entries = [];

    /** @type {Map<string, BookmarkableParamEntry>} */
    #entriesByKey = new Map();

    /** @type {boolean} */
    #suppressCapture = false;

    /** @type {(() => void)[]} */
    #disposers = [];

    /** @type {Set<string>} */
    #pendingWarnings = new Set();

    #warningsScheduled = false;

    /** @type {WeakSet<object>} */
    #pendingCollectors = new WeakSet();

    /**
     * @param {object} options
     * @param {View} options.root
     * @param {import("@reduxjs/toolkit").EnhancedStore<any>} options.store
     * @param {import("./intentExecutor.js").default<any>} options.intentExecutor
     */
    constructor({ root, store, intentExecutor }) {
        this.#root = root;
        this.#store = store;
        this.#intentExecutor = intentExecutor;

        this.#initEntries();
        this.#registerParamListeners();
        this.#subscribeToProvenance();
        this.#applyProvenanceEntries(this.#getPresentEntries());
    }

    dispose() {
        for (const disposer of this.#disposers) {
            disposer();
        }
        this.#disposers.length = 0;
    }

    /**
     * Captures bookmarkable params and precomputes selector keys for lookups.
     */
    #initEntries() {
        this.#entries = getBookmarkableParams(this.#root);
        this.#entriesByKey.clear();

        for (const entry of this.#entries) {
            const key = makeParamSelectorKey(entry.selector);
            this.#entriesByKey.set(key, entry);
        }
    }

    /**
     * Subscribes to ParamMediator changes and forwards them into provenance.
     */
    #registerParamListeners() {
        for (const entry of this.#entries) {
            const paramName = entry.selector.param;
            const unsubscribe = entry.view.paramMediator.subscribe(
                paramName,
                () => {
                    this.#handleParamChange(entry);
                }
            );
            this.#disposers.push(unsubscribe);
        }
    }

    #subscribeToProvenance() {
        const unsubscribe = subscribeTo(
            this.#store,
            (state) => state.provenance.present.paramProvenance.entries,
            withMicrotask((entries) => {
                this.#applyProvenanceEntries(entries);
            })
        );

        this.#disposers.push(unsubscribe);
    }

    /**
     * @returns {Record<string, ParamProvenanceEntry>}
     */
    #getPresentEntries() {
        return this.#store.getState().provenance.present.paramProvenance
            .entries;
    }

    /**
     * Serializes a param change into a provenance action unless suppressed.
     *
     * @param {BookmarkableParamEntry} entry
     */
    #handleParamChange(entry) {
        if (this.#suppressCapture) {
            return;
        }

        const paramName = entry.selector.param;
        const value = entry.view.paramMediator.getValue(paramName);
        if (value === undefined) {
            return;
        }

        const serialized = this.#serializeParamValue(entry, value);
        if (!serialized) {
            return;
        }

        const selectorKey = makeParamSelectorKey(entry.selector);
        if (this.#shouldUndoOnClear(entry, value, selectorKey)) {
            this.#store.dispatch(ActionCreators.undo());
            return;
        }

        const action = paramProvenanceSlice.actions.paramChange({
            selector: entry.selector,
            value: serialized,
        });

        this.#intentExecutor.dispatch(action);
    }

    /**
     * Returns true when a clear should undo the last matching selection action.
     *
     * @param {BookmarkableParamEntry} entry
     * @param {any} value
     * @param {string} selectorKey
     * @returns {boolean}
     */
    #shouldUndoOnClear(entry, value, selectorKey) {
        if (!isSelectionParameter(entry.param)) {
            return false;
        }

        if (
            !this.#isSelectionCleared(
                /** @type {import("@genome-spy/core/spec/parameter.js").SelectionParameter} */ (
                    entry.param
                ),
                value
            )
        ) {
            return false;
        }

        const { past, present } = this.#store.getState().provenance;
        if (past.length === 0) {
            return false;
        }

        const lastAction = present.lastAction;
        if (!lastAction) {
            return false;
        }

        if (!paramProvenanceSlice.actions.paramChange.match(lastAction)) {
            return false;
        }

        const lastSelector = lastAction.payload && lastAction.payload.selector;
        if (!lastSelector) {
            return false;
        }

        return makeParamSelectorKey(lastSelector) === selectorKey;
    }

    /**
     * Converts a live param value to a bookmark-friendly payload.
     *
     * @param {BookmarkableParamEntry} entry
     * @param {any} value
     * @returns {ParamValue | undefined}
     */
    #serializeParamValue(entry, value) {
        const param = entry.param;

        if (isSelectionParameter(param)) {
            const select = asSelectionConfig(param.select);

            if (isPointSelectionConfig(select)) {
                const keyFields = this.#getKeyFieldsForEntry(entry);
                if (!keyFields) {
                    return;
                }

                const keyTuples = getPointSelectionKeyTuples(value, keyFields);
                if (!keyTuples) {
                    return;
                }

                if (keyFields.length !== 1) {
                    throw new Error(
                        "Point selection key fields must contain exactly one field."
                    );
                }

                return {
                    type: "point",
                    keyField: keyFields[0],
                    keys: keyTuples.map((tuple) => tuple[0]),
                };
            }

            if (isIntervalSelectionConfig(select)) {
                if (!isIntervalSelection(value)) {
                    this.#warnSelection(
                        param,
                        "cannot be persisted because it has no value yet."
                    );
                    return;
                }

                /** @type {ParamValue} */
                return {
                    type: "interval",
                    intervals: this.#copyIntervals(
                        /** @type {any} */ (value.intervals)
                    ),
                };
            }

            throw new Error(
                `Unsupported selection config for parameter "${param.name}".`
            );
        }

        if (isVariableParameter(param)) {
            return { type: "value", value };
        }

        return;
    }

    /**
     * Applies provenance entries to ParamMediators, falling back to defaults.
     *
     * @param {Record<string, ParamProvenanceEntry>} entries
     */
    #applyProvenanceEntries(entries) {
        this.#suppressCapture = true;
        try {
            const knownKeys = new Set(this.#entriesByKey.keys());
            const unusedKeys = new Set(Object.keys(entries));

            for (const entry of this.#entries) {
                const selectorKey = makeParamSelectorKey(entry.selector);
                unusedKeys.delete(selectorKey);

                const storedEntry = entries[selectorKey];
                const value = storedEntry
                    ? this.#resolveStoredValue(entry, storedEntry)
                    : getDefaultParamValue(
                          entry.param,
                          entry.view.paramMediator
                      );

                const setter = entry.view.paramMediator.getSetter(
                    entry.selector.param
                );
                setter(value);
            }

            for (const key of unusedKeys) {
                if (!knownKeys.has(key)) {
                    const missing = entries[key];
                    const selector = missing && missing.selector;
                    const paramName =
                        selector && selector.param ? selector.param : "unknown";
                    const scope =
                        selector && selector.scope ? selector.scope : [];
                    this.#warnMissingParamInScope(paramName, scope);
                }
            }
        } finally {
            this.#suppressCapture = false;
        }
    }

    /**
     * Resolves a stored provenance entry to a runtime param value.
     *
     * @param {BookmarkableParamEntry} entry
     * @param {ParamProvenanceEntry} storedEntry
     * @returns {any}
     */
    #resolveStoredValue(entry, storedEntry) {
        const param = entry.param;
        const storedValue = storedEntry.value;

        if (isSelectionParameter(param)) {
            const select = asSelectionConfig(param.select);

            if (isPointSelectionConfig(select)) {
                if (storedValue.type !== "point") {
                    this.#warnSelection(
                        param,
                        "cannot be restored because the bookmark stored a different selection type."
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                const keyFields = this.#getKeyFieldsForEntry(entry);
                if (!keyFields) {
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                if (storedValue.keyField !== keyFields[0]) {
                    this.#warnSelection(
                        param,
                        `cannot be restored because the bookmark uses key field "${storedValue.keyField}" but the view now uses "${keyFields[0]}". Update encoding.key or recreate the bookmark.`
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                const keyTuples = storedValue.keys.map((key) => [key]);
                /** @type {(() => import("@genome-spy/core/data/collector.js").default) | undefined} */
                const getCollector =
                    typeof (/** @type {any} */ (entry.view).getCollector) ===
                    "function"
                        ? /** @type {any} */ (entry.view).getCollector
                        : undefined;
                const collector = getCollector
                    ? getCollector.call(entry.view)
                    : null;
                if (!collector) {
                    this.#warnSelection(
                        param,
                        "cannot be restored because the view does not expose data for key lookup."
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                if (!collector.completed) {
                    this.#scheduleReapply(collector);
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                const selectionType = select.toggle ? "multi" : "single";
                let resolved;
                try {
                    resolved = resolvePointSelectionFromKeyTuples(
                        selectionType,
                        keyFields,
                        keyTuples,
                        (fields, tuple) =>
                            collector.findDatumByKey(fields, tuple)
                    );
                } catch (error) {
                    this.#warnSelection(
                        param,
                        `cannot be restored due to an error: ${error}`
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                if (resolved.unresolved.length) {
                    this.#warnSelection(
                        param,
                        "has some points that could not be resolved. Ensure encoding.key is unique and present in the data."
                    );
                }

                return resolved.selection;
            }

            if (isIntervalSelectionConfig(select)) {
                if (storedValue.type !== "interval") {
                    this.#warnSelection(
                        param,
                        "cannot be restored because the bookmark stored a different selection type."
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                const selection = /** @type {any} */ (
                    createIntervalSelection(select.encodings)
                );
                this.#applyIntervals(selection, storedValue.intervals);

                const originIntervals = this.#resolveOriginIntervals(
                    storedEntry.origin
                );
                if (originIntervals) {
                    this.#applyIntervals(selection, originIntervals);
                }

                return selection;
            }

            return getDefaultParamValue(param, entry.view.paramMediator);
        }

        if (isVariableParameter(param)) {
            if (storedValue.type !== "value") {
                this.#warnParam(
                    param,
                    "cannot be restored because the bookmark stored a different value type."
                );
                return getDefaultParamValue(param, entry.view.paramMediator);
            }
            return storedValue.value;
        }

        return getDefaultParamValue(param, entry.view.paramMediator);
    }

    /**
     * Re-applies provenance once data collection completes.
     *
     * @param {import("@genome-spy/core/data/collector.js").default} collector
     */
    #scheduleReapply(collector) {
        if (this.#pendingCollectors.has(collector)) {
            return;
        }

        this.#pendingCollectors.add(collector);
        const unsubscribe = collector.observe(() => {
            this.#pendingCollectors.delete(collector);
            unsubscribe();
            this.#applyProvenanceEntries(this.#getPresentEntries());
        });
        this.#disposers.push(unsubscribe);
    }

    /**
     * Applies interval values to a selection object.
     *
     * @param {{ intervals: Record<string, [any, any] | null> }} selection
     * @param {Partial<Record<string, [any, any]>>} intervals
     */
    #applyIntervals(selection, intervals) {
        for (const [channel, interval] of Object.entries(intervals)) {
            if (interval) {
                selection.intervals[channel] = [interval[0], interval[1]];
            }
        }
    }

    /**
     * Rehydrates interval selections using an origin datum when available.
     *
     * @param {ParamOrigin | undefined} origin
     * @returns {Partial<Record<string, [any, any]>> | undefined}
     */
    #resolveOriginIntervals(origin) {
        if (!origin || origin.type !== "datum" || !origin.intervalSources) {
            return;
        }

        const originView = resolveViewSelector(this.#root, origin.view);
        if (!originView) {
            this.#warnOrigin(
                "the source view is missing. Using stored coordinates instead."
            );
            return;
        }

        /** @type {(() => import("@genome-spy/core/data/collector.js").default) | undefined} */
        const getCollector =
            typeof (/** @type {any} */ (originView).getCollector) === "function"
                ? /** @type {any} */ (originView).getCollector
                : undefined;
        const collector = getCollector ? getCollector.call(originView) : null;
        if (!collector) {
            this.#warnOrigin(
                "the source view does not expose data. Using stored coordinates instead."
            );
            return;
        }

        let datum;
        try {
            datum = collector.findDatumByKey([origin.keyField], [origin.key]);
        } catch (error) {
            this.#warnOrigin(`an error occurred: ${error}`);
            return;
        }

        if (!datum) {
            this.#warnOrigin(
                "the origin datum is missing. Using stored coordinates instead."
            );
            return;
        }

        /** @type {Partial<Record<string, [any, any]>>} */
        const intervals = {};

        for (const [channel, sources] of Object.entries(
            origin.intervalSources
        )) {
            const startField = sources.start;
            const endField = sources.end ?? sources.start;

            if (!startField || !endField) {
                continue;
            }

            /** @type {(datum: import("@genome-spy/core/data/flowNode.js").Datum) => any} */
            const startAccessor = field(startField);
            /** @type {(datum: import("@genome-spy/core/data/flowNode.js").Datum) => any} */
            const endAccessor = field(endField);
            intervals[channel] = [startAccessor(datum), endAccessor(datum)];
        }

        return intervals;
    }

    /**
     * Returns a short label for an import scope.
     *
     * @param {string[] | undefined} scope
     * @returns {string}
     */
    #formatScope(scope) {
        return JSON.stringify(scope ?? []);
    }

    /**
     * Queues a warning message for a parameter.
     *
     * @param {Parameter} param
     * @param {string} message
     */
    #warnParam(param, message) {
        this.#queueWarning(`Parameter "${param.name}" ${message}`);
    }

    /**
     * Queues a warning message for a selection parameter.
     *
     * @param {Parameter} param
     * @param {string} message
     */
    #warnSelection(param, message) {
        this.#queueWarning(`Selection "${param.name}" ${message}`);
    }

    /**
     * Queues a warning message for selection origins.
     *
     * @param {string} message
     */
    #warnOrigin(message) {
        this.#queueWarning(`Cannot resolve selection origin: ${message}`);
    }

    /**
     * Queues a warning for missing parameters in the current import scope.
     *
     * @param {string} paramName
     * @param {string[] | undefined} scope
     */
    #warnMissingParamInScope(paramName, scope) {
        this.#queueWarning(
            `Cannot restore parameter "${paramName}" in import scope ${this.#formatScope(
                scope
            )}. The parameter is missing or no longer unique in that scope. Check import names and parameter names.`
        );
    }

    /**
     * Checks whether a selection is cleared/empty.
     *
     * @param {import("@genome-spy/core/spec/parameter.js").SelectionParameter} param
     * @param {any} value
     * @returns {boolean}
     */
    #isSelectionCleared(param, value) {
        const select = asSelectionConfig(param.select);
        if (isPointSelectionConfig(select)) {
            if (isSinglePointSelection(value)) {
                return !value.datum;
            }
            if (isMultiPointSelection(value)) {
                return value.data.size === 0;
            }
            return true;
        }

        if (isIntervalSelectionConfig(select)) {
            return !isActiveIntervalSelection(value);
        }

        return false;
    }

    /**
     * Reads key fields from encoding and warns when unavailable.
     *
     * @param {BookmarkableParamEntry} entry
     * @returns {string[] | undefined}
     */
    #getKeyFieldsForEntry(entry) {
        let keyFields;
        try {
            keyFields = getEncodingKeyFields(entry.view.getEncoding());
        } catch (error) {
            this.#warnSelection(
                entry.param,
                `cannot use encoding.key: ${error}`
            );
            return;
        }

        if (!keyFields) {
            this.#warnSelection(
                entry.param,
                "cannot be persisted because encoding.key is missing on the owning view."
            );
            return;
        }

        return keyFields;
    }

    /**
     * Copies intervals to ensure we do not leak internal references.
     *
     * @param {Partial<Record<string, any[] | null>>} intervals
     * @returns {Partial<Record<string, [any, any]>>}
     */
    #copyIntervals(intervals) {
        /** @type {Partial<Record<string, [any, any]>>} */
        const copy = {};
        for (const [channel, interval] of Object.entries(intervals)) {
            if (interval) {
                copy[channel] = [interval[0], interval[1]];
            }
        }
        return copy;
    }

    /**
     * Coalesces warnings so restore errors show a single dialog.
     *
     * @param {string} message
     */
    #queueWarning(message) {
        this.#pendingWarnings.add(message);
        if (this.#warningsScheduled) {
            return;
        }

        this.#warningsScheduled = true;
        queueMicrotask(() => {
            this.#warningsScheduled = false;
            const messages = Array.from(this.#pendingWarnings);
            this.#pendingWarnings.clear();

            if (!messages.length) {
                return;
            }

            const items = messages.map((msg) => html`<li>${msg}</li>`);
            showMessageDialog(
                html`<p>
                        The visualization loaded, but some parameter state from
                        the bookmark could not be restored. Selections and bound
                        inputs may differ from the saved state.
                    </p>
                    <ul>
                        ${items}
                    </ul>`,
                {
                    title: "Parameter restore warnings",
                    type: "warning",
                }
            );
        });
    }
}
