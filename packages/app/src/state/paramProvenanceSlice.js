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
        paramChange: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<ParamProvenanceEntry>} */ action
        ) => {
            const key = makeParamSelectorKey(action.payload.selector);
            state.entries[key] = action.payload;
        },

        expandPointSelection: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<ExpandPointSelectionActionPayload>} */ action
        ) => {
            const payload = action.payload;
            const key = makeParamSelectorKey(payload.selector);
            state.entries[key] = {
                selector: payload.selector,
                value: {
                    type: "pointExpand",
                    operation: payload.operation,
                    predicate: payload.predicate,
                    partitionBy: payload.partitionBy,
                    origin: payload.origin,
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
