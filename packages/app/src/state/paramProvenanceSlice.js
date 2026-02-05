import { createSlice } from "@reduxjs/toolkit";
import { makeParamSelectorKey } from "@genome-spy/core/view/viewSelectors.js";

/**
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} ParamSelector
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("@genome-spy/core/spec/genome.js").ChromosomalLocus} ChromosomalLocus
 *
 * @typedef {{ type: "value", value: any }} ParamValueLiteral
 * @typedef {{ type: "interval", intervals: Partial<Record<"x" | "y", [number, number] | [ChromosomalLocus, ChromosomalLocus] | null>> }} ParamValueInterval
 * @typedef {{ type: "point", keyField: string, keys: Scalar[] }} ParamValuePoint
 * @typedef {ParamValueLiteral | ParamValueInterval | ParamValuePoint} ParamValue
 *
 * @typedef {{ type: "datum", view: ViewSelector, keyField: string, key: Scalar, intervalSources?: Record<string, { start?: string, end?: string }> }} ParamOrigin
 *
 * @typedef {{ selector: ParamSelector, value: ParamValue, origin?: ParamOrigin }} ParamProvenanceEntry
 * @typedef {{ entries: Record<string, ParamProvenanceEntry> }} ParamProvenanceState
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
    },
});

/**
 * Returns a group key for paramChange actions to coalesce consecutive updates.
 *
 * @param {import("@reduxjs/toolkit").Action} action
 * @returns {string | null}
 */
export function getParamChangeGroupKey(action) {
    if (!paramProvenanceSlice.actions.paramChange.match(action)) {
        return null;
    }

    const payload = /** @type {any} */ (action).payload;
    const selector = payload?.selector;
    if (!selector || !Array.isArray(selector.scope) || !selector.param) {
        return null;
    }

    return makeParamSelectorKey(selector);
}
