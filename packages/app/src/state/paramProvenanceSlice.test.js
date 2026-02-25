// @ts-check
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

    it("returns a group key for value and interval paramChange actions", () => {
        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "bar" },
            value: { type: "value", value: "x" },
        });

        const intervalAction = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "bar" },
            value: { type: "interval", intervals: { x: [1, 2] } },
        });

        const expandAction = paramProvenanceSlice.actions.expandPointSelection({
            selector: { scope: [], param: "bar" },
            operation: "replace",
            rule: {
                kind: "sameFieldValue",
                field: "clusterId",
            },
            origin: {
                view: { scope: [], view: "points" },
                keyTuple: ["A"],
            },
        });

        expect(getParamChangeGroupKey(action)).toBe(
            makeParamSelectorKey(action.payload.selector)
        );
        expect(getParamChangeGroupKey(intervalAction)).toBe(
            makeParamSelectorKey(intervalAction.payload.selector)
        );
        expect(getParamChangeGroupKey(expandAction)).toBeNull();
        expect(getParamChangeGroupKey({ type: "other/action" })).toBeNull();
    });

    it("stores point expansion entries keyed by selector", () => {
        const selector = { scope: [], param: "selection" };
        const action = paramProvenanceSlice.actions.expandPointSelection({
            selector,
            operation: "replace",
            rule: {
                kind: "sameFieldValue",
                field: "clusterId",
            },
            partitionBy: ["patientId"],
            origin: {
                view: { scope: [], view: "points" },
                keyTuple: ["seed"],
            },
        });

        const state = paramProvenanceSlice.reducer(undefined, action);
        const key = makeParamSelectorKey(selector);

        expect(state.entries[key]).toEqual({
            selector,
            value: {
                type: "pointExpand",
                operation: "replace",
                rule: {
                    kind: "sameFieldValue",
                    field: "clusterId",
                },
                partitionBy: ["patientId"],
                origin: {
                    view: { scope: [], view: "points" },
                    keyTuple: ["seed"],
                },
            },
        });
    });

    it("stores predicate-based expansion entries for compatibility", () => {
        const selector = { scope: [], param: "selection" };
        const action = paramProvenanceSlice.actions.expandPointSelection({
            selector,
            operation: "replace",
            predicate: {
                field: "clusterId",
                op: "eq",
                valueFromField: "clusterId",
            },
            origin: {
                view: { scope: [], view: "points" },
                keyTuple: ["seed"],
            },
        });

        const state = paramProvenanceSlice.reducer(undefined, action);
        const key = makeParamSelectorKey(selector);
        expect(state.entries[key].value).toEqual({
            type: "pointExpand",
            operation: "replace",
            predicate: {
                field: "clusterId",
                op: "eq",
                valueFromField: "clusterId",
            },
            origin: {
                view: { scope: [], view: "points" },
                keyTuple: ["seed"],
            },
            partitionBy: undefined,
        });
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
        expect(
            /** @type {any} */ (state.present.paramProvenance.entries[key])
                .value.value
        ).toBe(2);
    });

    it("coalesces point selection changes by selector", () => {
        const reducer = createProvenanceReducer(
            { paramProvenance: paramProvenanceSlice.reducer },
            { groupBy: getParamChangeGroupKey }
        );

        const selector = { scope: [], param: "selection" };
        const action1 = paramProvenanceSlice.actions.paramChange({
            selector,
            value: { type: "point", keyFields: ["id"], keys: [["A"]] },
        });
        const action2 = paramProvenanceSlice.actions.paramChange({
            selector,
            value: { type: "point", keyFields: ["id"], keys: [["B"]] },
        });

        let state = reducer(undefined, { type: "@@INIT" });
        state = reducer(state, action1);
        state = reducer(state, action2);

        expect(state.past.length).toBe(0);
        const key = makeParamSelectorKey(selector);
        expect(
            /** @type {any} */ (state.present.paramProvenance.entries[key])
                .value.keys
        ).toEqual([["B"]]);
    });
});
