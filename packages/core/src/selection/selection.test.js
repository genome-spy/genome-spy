import { describe, it, expect } from "vitest";
import {
    asEventConfig,
    createMultiPointSelection,
    createSinglePointSelection,
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
    it("serializes point selections to key tuples", () => {
        const datum = { id: "a", sampleId: "S1", chrom: "chr1", _uniqueId: 1 };
        const single = createSinglePointSelection(datum);
        const multi = createMultiPointSelection([
            datum,
            { id: "b", sampleId: "S2", chrom: "chr2", _uniqueId: 2 },
        ]);

        expect(getPointSelectionKeyTuples(single, ["id"])).toEqual([["a"]]);
        expect(
            getPointSelectionKeyTuples(single, ["sampleId", "chrom"])
        ).toEqual([["S1", "chr1"]]);
        expect(getPointSelectionKeyTuples(multi, ["id"])).toEqual([
            ["a"],
            ["b"],
        ]);
        expect(
            getPointSelectionKeyTuples(multi, ["sampleId", "chrom"])
        ).toEqual([
            ["S1", "chr1"],
            ["S2", "chr2"],
        ]);
        expect(
            getPointSelectionKeyTuples(createSinglePointSelection(null), ["id"])
        ).toEqual([]);
    });

    it("resolves key tuples back to point selections", () => {
        const datum = { id: "a", _uniqueId: 1 };
        /** @type {Map<import("../spec/channel.js").Scalar, typeof datum>} */
        const byKey = new Map([["a", datum]]);
        /** @type {(fields: string[], tuple: import("../spec/channel.js").Scalar[]) => any} */
        const resolveDatum = (_fields, tuple) =>
            byKey.get(
                /** @type {import("../spec/channel.js").Scalar} */ (tuple[0])
            );

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

    it("resolves multi-field key tuples back to point selections", () => {
        const datumA = { sampleId: "S1", chrom: "chr1", _uniqueId: 1 };
        const datumB = { sampleId: "S2", chrom: "chr2", _uniqueId: 2 };
        const index = new Map([
            [JSON.stringify(["S1", "chr1"]), datumA],
            [JSON.stringify(["S2", "chr2"]), datumB],
        ]);
        /** @type {(fields: string[], tuple: import("../spec/channel.js").Scalar[]) => any} */
        const resolveDatum = (_fields, tuple) =>
            index.get(JSON.stringify(tuple));

        const resolved = resolvePointSelectionFromKeyTuples(
            "multi",
            ["sampleId", "chrom"],
            [
                ["S1", "chr1"],
                ["S2", "chr2"],
            ],
            resolveDatum
        );

        expect(resolved.selection).toEqual(
            createMultiPointSelection([datumA, datumB])
        );
        expect(resolved.unresolved).toEqual([]);
    });
});
