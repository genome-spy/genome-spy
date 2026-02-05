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

    #initEntries() {
        this.#entries = getBookmarkableParams(this.#root);
        this.#entriesByKey.clear();

        for (const entry of this.#entries) {
            const key = makeParamSelectorKey(entry.selector);
            this.#entriesByKey.set(key, entry);
        }
    }

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
     * @param {BookmarkableParamEntry} entry
     * @param {any} value
     * @param {string} selectorKey
     * @returns {boolean}
     */
    #shouldUndoOnClear(entry, value, selectorKey) {
        if (!isSelectionParameter(entry.param)) {
            return false;
        }

        if (!this.#isSelectionCleared(entry.param, value)) {
            return false;
        }

        const lastAction = this.#store.getState().provenance.present.lastAction;
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
                    this.#queueWarning(
                        `Cannot persist interval selection "${param.name}". The selection value is missing.`
                    );
                    return;
                }

                /** @type {ParamValue} */
                return {
                    type: "interval",
                    intervals: this.#copyIntervals(value.intervals),
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
                    this.#queueWarning(
                        `Cannot restore parameter "${paramName}" in import scope ${JSON.stringify(
                            scope
                        )}. Ensure the parameter exists and has a unique name in that scope.`
                    );
                }
            }
        } finally {
            this.#suppressCapture = false;
        }
    }

    /**
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
                    this.#queueWarning(
                        `Cannot restore selection "${param.name}" because the stored value is not a point selection.`
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
                    this.#queueWarning(
                        `Cannot restore selection "${param.name}" because the key field does not match the current encoding.`
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                const keyTuples = storedValue.keys.map((key) => [key]);
                const collector =
                    "getCollector" in entry.view
                        ? entry.view.getCollector()
                        : null;
                if (!collector) {
                    this.#queueWarning(
                        `Cannot restore selection "${param.name}" because no data collector is available.`
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
                    this.#queueWarning(
                        `Cannot restore selection "${param.name}": ${error}`
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                if (resolved.unresolved.length) {
                    this.#queueWarning(
                        `Some selected points for "${param.name}" could not be resolved. Ensure that the key field is unique and present in the data.`
                    );
                }

                return resolved.selection;
            }

            if (isIntervalSelectionConfig(select)) {
                if (storedValue.type !== "interval") {
                    this.#queueWarning(
                        `Cannot restore selection "${param.name}" because the stored value is not an interval selection.`
                    );
                    return getDefaultParamValue(
                        param,
                        entry.view.paramMediator
                    );
                }

                const selection = createIntervalSelection(select.encodings);
                for (const [channel, interval] of Object.entries(
                    storedValue.intervals
                )) {
                    if (interval) {
                        selection.intervals[channel] = [
                            interval[0],
                            interval[1],
                        ];
                    }
                }

                const originIntervals = this.#resolveOriginIntervals(
                    storedEntry.origin
                );
                if (originIntervals) {
                    for (const [channel, interval] of Object.entries(
                        originIntervals
                    )) {
                        if (interval) {
                            selection.intervals[channel] = interval;
                        }
                    }
                }

                return selection;
            }

            return getDefaultParamValue(param, entry.view.paramMediator);
        }

        if (isVariableParameter(param)) {
            if (storedValue.type !== "value") {
                this.#queueWarning(
                    `Cannot restore parameter "${param.name}" because the stored value type does not match.`
                );
                return getDefaultParamValue(param, entry.view.paramMediator);
            }
            return storedValue.value;
        }

        return getDefaultParamValue(param, entry.view.paramMediator);
    }

    /**
     * @param {object} collector
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
     * @param {ParamOrigin | undefined} origin
     * @returns {Partial<Record<string, [any, any]>> | undefined}
     */
    #resolveOriginIntervals(origin) {
        if (!origin || origin.type !== "datum" || !origin.intervalSources) {
            return;
        }

        const originView = resolveViewSelector(this.#root, origin.view);
        if (!originView) {
            this.#queueWarning(
                "Cannot resolve selection origin because the source view is missing."
            );
            return;
        }

        const collector =
            "getCollector" in originView ? originView.getCollector() : null;
        if (!collector) {
            this.#queueWarning(
                "Cannot resolve selection origin because no data collector is available."
            );
            return;
        }

        let datum;
        try {
            datum = collector.findDatumByKey([origin.keyField], [origin.key]);
        } catch (error) {
            this.#queueWarning(`Cannot resolve selection origin: ${error}`);
            return;
        }

        if (!datum) {
            this.#queueWarning(
                "Cannot resolve selection origin because the origin datum is missing."
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
     * @param {Parameter} param
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
     * @param {BookmarkableParamEntry} entry
     * @returns {string[] | undefined}
     */
    #getKeyFieldsForEntry(entry) {
        let keyFields;
        try {
            keyFields = getEncodingKeyFields(entry.view.getEncoding());
        } catch (error) {
            this.#queueWarning(String(error));
            return;
        }

        if (!keyFields) {
            this.#queueWarning(
                `Cannot persist selection "${entry.param.name}". Add encoding.key to the view that owns the selection.`
            );
            return;
        }

        return keyFields;
    }

    /**
     * @param {Partial<Record<string, [any, any]>>} intervals
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
                        The visualization loaded, but some parameter state could
                        not be restored.
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
