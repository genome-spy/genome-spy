import { describe, expect, it } from "vitest";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import {
    getParamChangeGroupKey,
    paramProvenanceSlice,
} from "./paramProvenanceSlice.js";
import { makeParamSelectorKey } from "@genome-spy/core/view/viewSelectors.js";

describe("paramProvenanceSlice", () => {
    it("stores entries keyed by selector", () => {
        const selector = { scope: ["a"], param: "foo" };
        const action = paramProvenanceSlice.actions.paramChange({
            selector,
            value: { type: "value", value: 42 },
        });

        const state = paramProvenanceSlice.reducer(undefined, action);
        const key = makeParamSelectorKey(selector);

        expect(state.entries[key]).toEqual(action.payload);
    });

    it("returns a group key for paramChange actions", () => {
        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "bar" },
            value: { type: "value", value: "x" },
        });

        expect(getParamChangeGroupKey(action)).toBe(
            makeParamSelectorKey(action.payload.selector)
        );
        expect(getParamChangeGroupKey({ type: "other/action" })).toBeNull();
    });

    it("coalesces consecutive param changes for the same selector", () => {
        // Non-obvious: redux-undo groups actions with the same groupBy key,
        // so the past length remains unchanged for consecutive updates.
        const reducer = createProvenanceReducer(
            { paramProvenance: paramProvenanceSlice.reducer },
            { groupBy: getParamChangeGroupKey }
        );

        const selector = { scope: [], param: "baz" };
        const action1 = paramProvenanceSlice.actions.paramChange({
            selector,
            value: { type: "value", value: 1 },
        });
        const action2 = paramProvenanceSlice.actions.paramChange({
            selector,
            value: { type: "value", value: 2 },
        });

        let state = reducer(undefined, { type: "@@INIT" });
        state = reducer(state, action1);
        state = reducer(state, action2);

        expect(state.past.length).toBe(0);
        const key = makeParamSelectorKey(selector);
        expect(state.present.paramProvenance.entries[key].value.value).toBe(2);
    });
});
