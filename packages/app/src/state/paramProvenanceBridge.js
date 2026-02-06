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
import throttle from "@genome-spy/core/utils/throttle.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";
import { subscribeTo, withMicrotask } from "./subscribeTo.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";

const THROTTLE_INTERVAL_MS = 150;

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
    #pendingPersistWarnings = new Set();

    /** @type {Set<string>} */
    #pendingRestoreWarnings = new Set();

    /** @type {Set<string>} */
    #persistWarningsSeen = new Set();

    /** @type {Set<string>} */
    #unpersistableKeys = new Set();

    #persistWarningsScheduled = false;

    #restoreWarningsScheduled = false;

    /** @type {WeakSet<object>} */
    #pendingCollectors = new WeakSet();

    /** @type {Map<string, ((entry: BookmarkableParamEntry, value: ParamValue) => void) & { cancel: () => void }>} */
    #throttledDispatchers = new Map();

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
        this.#clearThrottledDispatchers();
    }

    /**
     * Captures bookmarkable params and precomputes selector keys for lookups.
     */
    #initEntries() {
        this.#entries = getBookmarkableParams(this.#root);
        this.#entriesByKey.clear();
        this.#unpersistableKeys.clear();

        for (const entry of this.#entries) {
            const key = makeParamSelectorKey(entry.selector);
            this.#entriesByKey.set(key, entry);
            this.#markUnpersistable(entry, key);
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

        const selectorKey = makeParamSelectorKey(entry.selector);
        if (this.#unpersistableKeys.has(selectorKey)) {
            return;
        }

        const paramName = entry.selector.param;
        const value = entry.view.paramMediator.getValue(paramName);
        if (value === undefined) {
            return;
        }

        // Skip redundant clear events: interaction handlers emit clears even
        // when selection is already empty, so if both live and stored selections
        // are empty, there is nothing to record in provenance.
        if (
            isSelectionParameter(entry.param) &&
            this.#isSelectionCleared(
                /** @type {import("@genome-spy/core/spec/parameter.js").SelectionParameter} */ (
                    entry.param
                ),
                value
            ) &&
            this.#isSelectionClearedInProvenance(entry, selectorKey)
        ) {
            return;
        }

        const serialized = this.#serializeParamValue(entry, value);
        if (!serialized) {
            return;
        }

        if (this.#shouldUndoOnClear(entry, value, selectorKey)) {
            this.#cancelThrottledDispatch(selectorKey);
            this.#store.dispatch(ActionCreators.undo());
            return;
        }

        if (this.#shouldThrottle(entry.param)) {
            this.#getThrottledDispatch(selectorKey)(entry, serialized);
            return;
        }

        this.#dispatchParamChange(entry, serialized);
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

        if (makeParamSelectorKey(lastSelector) !== selectorKey) {
            return false;
        }

        const previous = past[past.length - 1];
        const previousEntry =
            previous &&
            previous.paramProvenance &&
            previous.paramProvenance.entries &&
            previous.paramProvenance.entries[selectorKey];
        if (!previousEntry) {
            return true;
        }

        return this.#isSerializedSelectionCleared(
            entry.param,
            previousEntry.value
        );
    }

    /**
     * @param {Parameter} param
     * @param {ParamValue | undefined} value
     * @returns {boolean}
     */
    #isSerializedSelectionCleared(param, value) {
        if (!value || !isSelectionParameter(param)) {
            return true;
        }

        if (value.type === "point") {
            return value.keys.length === 0;
        }

        if (value.type === "interval") {
            const intervals = value.intervals ?? {};
            for (const interval of Object.values(intervals)) {
                if (interval && interval[0] != null && interval[1] != null) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    /**
     * @param {BookmarkableParamEntry} entry
     * @param {string} selectorKey
     * @returns {boolean}
     */
    #isSelectionClearedInProvenance(entry, selectorKey) {
        const stored = this.#getPresentEntries()[selectorKey];
        if (!stored) {
            return true;
        }

        return this.#isSerializedSelectionCleared(entry.param, stored.value);
    }

    /**
     * @param {Parameter} param
     * @returns {boolean}
     */
    #shouldThrottle(param) {
        if (isSelectionParameter(param)) {
            return true;
        }

        return isVariableParameter(param) && Boolean(param.bind);
    }

    /**
     * @param {BookmarkableParamEntry} entry
     * @param {ParamValue} serialized
     */
    #dispatchParamChange(entry, serialized) {
        const action = paramProvenanceSlice.actions.paramChange({
            selector: entry.selector,
            value: serialized,
        });

        this.#intentExecutor.dispatch(action);
    }

    /**
     * @param {string} selectorKey
     * @returns {((entry: BookmarkableParamEntry, value: ParamValue) => void) & { cancel: () => void }}
     */
    #getThrottledDispatch(selectorKey) {
        let throttled = this.#throttledDispatchers.get(selectorKey);
        if (!throttled) {
            /**
             * @param {BookmarkableParamEntry} entry
             * @param {ParamValue} value
             */
            const dispatchThrottled = (entry, value) => {
                if (this.#suppressCapture) {
                    return;
                }
                this.#dispatchParamChange(entry, value);
            };
            throttled = throttle(dispatchThrottled, THROTTLE_INTERVAL_MS);
            this.#throttledDispatchers.set(selectorKey, throttled);
        }
        return throttled;
    }

    /**
     * @param {string} selectorKey
     */
    #cancelThrottledDispatch(selectorKey) {
        const throttled = this.#throttledDispatchers.get(selectorKey);
        if (!throttled) {
            return;
        }
        throttled.cancel();
    }

    #clearThrottledDispatchers() {
        for (const throttled of this.#throttledDispatchers.values()) {
            throttled.cancel();
        }
        this.#throttledDispatchers.clear();
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
                const keyFields = this.#getKeyFieldsForPersist(entry);
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
                    this.#warnPersistSelection(
                        param,
                        "has no value yet and will not be saved."
                    );
                    return;
                }

                /** @type {ParamValue} */
                return {
                    type: "interval",
                    intervals: this.#serializeIntervals(
                        entry,
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
                if (this.#unpersistableKeys.has(selectorKey)) {
                    continue;
                }

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

                const keyFields = this.#getKeyFieldsForRestore(entry);
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
                this.#applyIntervals(
                    entry.view,
                    selection,
                    storedValue.intervals
                );

                const originIntervals = this.#resolveOriginIntervals(
                    storedEntry.origin
                );
                if (originIntervals) {
                    this.#applyIntervals(
                        entry.view,
                        selection,
                        originIntervals
                    );
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
     * @param {View} view
     * @param {{ intervals: Record<string, [any, any] | null> }} selection
     * @param {Partial<Record<string, [any, any]>>} intervals
     */
    #applyIntervals(view, selection, intervals) {
        for (const [channel, interval] of Object.entries(intervals)) {
            if (interval) {
                const channelWithScale =
                    /** @type {import("@genome-spy/core/spec/channel.js").ChannelWithScale} */ (
                        channel
                    );
                const resolution = view.getScaleResolution(channelWithScale);
                selection.intervals[channel] = [
                    resolution?.fromComplex
                        ? resolution.fromComplex(interval[0])
                        : interval[0],
                    resolution?.fromComplex
                        ? resolution.fromComplex(interval[1])
                        : interval[1],
                ];
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

            const startAccessor = field(startField);
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
        this.#queueRestoreWarning(`Parameter "${param.name}" ${message}`);
    }

    /**
     * Queues a warning message for a selection parameter during restore.
     *
     * @param {Parameter} param
     * @param {string} message
     */
    #warnSelection(param, message) {
        this.#queueRestoreWarning(`Selection "${param.name}" ${message}`);
    }

    /**
     * Queues a warning message for a selection parameter during persistence.
     *
     * @param {Parameter} param
     * @param {string} message
     */
    #warnPersistSelection(param, message) {
        this.#queuePersistWarning(`Selection "${param.name}" ${message}`);
    }

    /**
     * Queues a warning message for selection origins.
     *
     * @param {string} message
     */
    #warnOrigin(message) {
        this.#queueRestoreWarning(
            `Cannot resolve selection origin: ${message}`
        );
    }

    /**
     * Queues a warning for missing parameters in the current import scope.
     *
     * @param {string} paramName
     * @param {string[] | undefined} scope
     */
    #warnMissingParamInScope(paramName, scope) {
        this.#queueRestoreWarning(
            `Cannot restore parameter "${paramName}" in import scope ${this.#formatScope(
                scope
            )}. The parameter is missing or no longer unique in that scope. Check import names and parameter names.`
        );
    }

    /**
     * Marks a parameter as unpersistable and queues a warning when needed.
     *
     * @param {BookmarkableParamEntry} entry
     * @param {string} selectorKey
     */
    #markUnpersistable(entry, selectorKey) {
        const param = entry.param;
        if (!isSelectionParameter(param)) {
            return;
        }

        const select = asSelectionConfig(param.select);
        if (!isPointSelectionConfig(select)) {
            return;
        }

        let keyFields;
        try {
            keyFields = getEncodingKeyFields(entry.view.getEncoding());
        } catch (error) {
            this.#unpersistableKeys.add(selectorKey);
            this.#warnPersistSelection(
                param,
                `will not be saved because encoding.key is invalid: ${error}`
            );
            return;
        }

        if (!keyFields) {
            this.#unpersistableKeys.add(selectorKey);
            this.#warnPersistSelection(
                param,
                "will not be saved to bookmarks because encoding.key is missing on the owning view. Add encoding.key or set persist: false."
            );
        }
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
    #getKeyFieldsForPersist(entry) {
        let keyFields;
        try {
            keyFields = getEncodingKeyFields(entry.view.getEncoding());
        } catch (error) {
            this.#warnPersistSelection(
                entry.param,
                `cannot be saved because encoding.key is invalid: ${error}`
            );
            return;
        }

        if (!keyFields) {
            this.#warnPersistSelection(
                entry.param,
                "will not be saved to bookmarks because encoding.key is missing on the owning view. Add encoding.key or set persist: false."
            );
            return;
        }

        return keyFields;
    }

    /**
     * Reads key fields from encoding for restore warnings.
     *
     * @param {BookmarkableParamEntry} entry
     * @returns {string[] | undefined}
     */
    #getKeyFieldsForRestore(entry) {
        let keyFields;
        try {
            keyFields = getEncodingKeyFields(entry.view.getEncoding());
        } catch (error) {
            this.#warnSelection(
                entry.param,
                `cannot be restored because encoding.key is invalid: ${error}`
            );
            return;
        }

        if (!keyFields) {
            this.#warnSelection(
                entry.param,
                "cannot be restored because encoding.key is missing on the owning view."
            );
            return;
        }

        return keyFields;
    }

    /**
     * Copies intervals to ensure we do not leak internal references.
     *
     * @param {BookmarkableParamEntry} entry
     * @param {Partial<Record<string, any[] | null>>} intervals
     * @returns {Partial<Record<string, [any, any]>>}
     */
    #serializeIntervals(entry, intervals) {
        /** @type {Partial<Record<string, [any, any]>>} */
        const copy = {};
        for (const [channel, interval] of Object.entries(intervals)) {
            if (interval) {
                const channelWithScale =
                    /** @type {import("@genome-spy/core/spec/channel.js").ChannelWithScale} */ (
                        channel
                    );
                const resolution =
                    "getScaleResolution" in entry.view
                        ? entry.view.getScaleResolution(channelWithScale)
                        : null;
                copy[channel] = [
                    resolution && resolution.type === "locus"
                        ? resolution.toComplex(interval[0])
                        : interval[0],
                    resolution && resolution.type === "locus"
                        ? resolution.toComplex(interval[1])
                        : interval[1],
                ];
            }
        }
        return copy;
    }

    /**
     * Coalesces warnings so restore errors show a single dialog.
     *
     * @param {string} message
     */
    #queuePersistWarning(message) {
        if (this.#persistWarningsSeen.has(message)) {
            return;
        }

        this.#persistWarningsSeen.add(message);
        this.#pendingPersistWarnings.add(message);
        if (this.#persistWarningsScheduled) {
            return;
        }

        this.#persistWarningsScheduled = true;
        queueMicrotask(() => {
            this.#persistWarningsScheduled = false;
            const messages = Array.from(this.#pendingPersistWarnings);
            this.#pendingPersistWarnings.clear();

            if (!messages.length) {
                return;
            }

            const items = messages.map((msg) => html`<li>${msg}</li>`);
            showMessageDialog(
                html`<p>
                        Some interactive parameters cannot be saved to bookmarks
                        or provenance. The visualization is still usable, but
                        those selections will not be preserved.
                    </p>
                    <p>
                        To fix this, add <code>encoding.key</code> or set
                        <code>persist: false</code> on ephemeral params.
                    </p>
                    <ul>
                        ${items}
                    </ul>`,
                {
                    title: "Bookmark persistence warnings",
                    type: "warning",
                }
            );
        });
    }

    /**
     * Coalesces restore warnings so failures show a single dialog.
     *
     * @param {string} message
     */
    #queueRestoreWarning(message) {
        this.#pendingRestoreWarnings.add(message);
        if (this.#restoreWarningsScheduled) {
            return;
        }

        this.#restoreWarningsScheduled = true;
        queueMicrotask(() => {
            this.#restoreWarningsScheduled = false;
            const messages = Array.from(this.#pendingRestoreWarnings);
            this.#pendingRestoreWarnings.clear();

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
