import { describe, it, expect } from "vitest";
import {
    asEventConfig,
    createMultiPointSelection,
    createSinglePointSelection,
    getEncodingKeyFields,
    getPointSelectionKeyTuples,
    resolvePointSelectionFromKeyTuples,
} from "./selection.js";

describe("asEventSpec", () => {
    it("parses a simple string event type", () => {
        const res = asEventConfig("click");
        expect(res).toEqual({ type: "click" });
    });

    it("parses a string event type with bracket filter", () => {
        const res = asEventConfig("click[event.shiftKey]");
        expect(res).toEqual({ type: "click", filter: "event.shiftKey" });
    });
});

describe("key-based selection helpers", () => {
    it("extracts key fields from encoding", () => {
        expect(getEncodingKeyFields({})).toBeUndefined();
        expect(getEncodingKeyFields({ key: { field: "id" } })).toEqual(["id"]);
    });

    it("serializes point selections to key tuples", () => {
        const datum = { id: "a", _uniqueId: 1 };
        const single = createSinglePointSelection(datum);
        const multi = createMultiPointSelection([
            datum,
            { id: "b", _uniqueId: 2 },
        ]);

        expect(getPointSelectionKeyTuples(single, ["id"])).toEqual([["a"]]);
        expect(getPointSelectionKeyTuples(multi, ["id"])).toEqual([
            ["a"],
            ["b"],
        ]);
        expect(
            getPointSelectionKeyTuples(createSinglePointSelection(null), ["id"])
        ).toEqual([]);
    });

    it("resolves key tuples back to point selections", () => {
        const datum = { id: "a", _uniqueId: 1 };
        const byKey = new Map([["a", datum]]);
        const resolveDatum = (_fields, tuple) => byKey.get(tuple[0]);

        const single = resolvePointSelectionFromKeyTuples(
            "single",
            ["id"],
            [["a"]],
            resolveDatum
        );

        expect(single.selection).toEqual(createSinglePointSelection(datum));
        expect(single.unresolved).toEqual([]);

        const multi = resolvePointSelectionFromKeyTuples(
            "multi",
            ["id"],
            [["a"], ["missing"]],
            resolveDatum
        );

        expect(multi.selection).toEqual(createMultiPointSelection([datum]));
        expect(multi.unresolved).toEqual([["missing"]]);
    });
});
