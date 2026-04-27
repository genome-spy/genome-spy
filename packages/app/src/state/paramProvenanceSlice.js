import { createSlice } from "@reduxjs/toolkit";
import { makeParamSelectorKey } from "@genome-spy/core/view/viewSelectors.js";

/**
 * @typedef {import("./paramProvenanceTypes.d.ts").ParamProvenanceEntry} ParamProvenanceEntry
 * @typedef {import("./paramProvenanceTypes.d.ts").ExpandPointSelectionActionPayload} ExpandPointSelectionActionPayload
 * @typedef {import("./paramProvenanceTypes.d.ts").ParamProvenanceState} ParamProvenanceState
 */

/** @type {ParamProvenanceState} */
const initialState = {
    entries: {},
};

export const paramProvenanceSlice = createSlice({
    name: "paramProvenance",
    initialState,
    reducers: {
        /**
         * Create or update a reactive selection or parameter value, including
         * point selections, interval selections, and genomic-region selections.
         *
         * Use this for point selections, interval selections, genomic-region
         * selections, and other replayable parameter changes.
         *
         * @agent.payloadType ParamProvenanceEntry
         * @agent.category provenance
         * @example {"selector":{"scope":[],"param":"brush"},"value":{"type":"interval","intervals":{"x":[{"chrom":"chr17","pos":7685012},{"chrom":"chr17","pos":7690727}]}}}
         * @example {"selector":{"scope":[],"param":"semanticZoomSlider"},"value":{"type":"value","value":0}}
         */
        paramChange: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<ParamProvenanceEntry>} */ action
        ) => {
            const key = makeParamSelectorKey(action.payload.selector);
            state.entries[key] = action.payload;
        },

        /**
         * Expand a point selection into provenance state.
         *
         * @agent.payloadType ExpandPointSelectionActionPayload
         * @agent.ignore true
         */
        // Keep expansion as a dedicated intent action (instead of folding it
        // into paramChange) so IntentPipeline hooks can target it explicitly.
        expandPointSelection: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<ExpandPointSelectionActionPayload>} */ action
        ) => {
            const payload = action.payload;
            const key = makeParamSelectorKey(payload.selector);
            let matcher;
            if ("rule" in payload && payload.rule) {
                matcher = { rule: payload.rule };
            } else if ("predicate" in payload && payload.predicate) {
                matcher = { predicate: payload.predicate };
            } else {
                throw new Error(
                    "expandPointSelection requires either 'rule' or 'predicate'."
                );
            }

            state.entries[key] = {
                selector: payload.selector,
                value: {
                    type: "pointExpand",
                    operation: payload.operation,
                    partitionBy: payload.partitionBy,
                    origin: payload.origin,
                    ...matcher,
                },
            };
        },
    },
});

/**
 * Returns a group key for paramChange actions to coalesce consecutive updates.
 *
 * @param {import("@reduxjs/toolkit").Action} action
 * @returns {string | null}
 */
export function getParamChangeGroupKey(action) {
    if (paramProvenanceSlice.actions.expandPointSelection.match(action)) {
        return null;
    }

    if (!paramProvenanceSlice.actions.paramChange.match(action)) {
        return null;
    }

    const payload = /** @type {any} */ (action).payload;
    const selector = payload?.selector;
    if (!selector || !Array.isArray(selector.scope) || !selector.param) {
        return null;
    }

    const valueType = payload?.value?.type;
    if (valueType === "pointExpand") {
        return null;
    }

    return makeParamSelectorKey(selector);
}
