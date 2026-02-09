import { describe, expect, test } from "vitest";
import KeyIndex from "./keyIndex.js";

describe("KeyIndex", () => {
    test("finds data by single-field keys", () => {
        const keyIndex = new KeyIndex();
        const data = [{ id: "a" }, { id: "b" }];

        expect(keyIndex.findDatum(["id"], ["a"], [data])).toEqual(data[0]);
        expect(keyIndex.findDatum(["id"], ["missing"], [data])).toBeUndefined();
    });

    test("finds data by composite keys", () => {
        const keyIndex = new KeyIndex();
        const data = [
            { sampleId: "S1", chrom: "chr1", pos: 10 },
            { sampleId: "S2", chrom: "chr2", pos: 20 },
        ];

        expect(
            keyIndex.findDatum(
                ["sampleId", "chrom", "pos"],
                ["S1", "chr1", 10],
                [data]
            )
        ).toEqual(data[0]);
    });

    test("throws on duplicate keys", () => {
        const keyIndex = new KeyIndex();
        const data = [{ id: "a" }, { id: "a" }];

        expect(() => keyIndex.findDatum(["id"], ["a"], [data])).toThrow(
            /Duplicate key/
        );
    });

    test("throws on nullish key fields", () => {
        const keyIndex = new KeyIndex();
        const data = [{ id: /** @type {string | undefined} */ (undefined) }];

        // Non-obvious: index construction validates key field values eagerly.
        expect(() => keyIndex.findDatum(["id"], ["x"], [data])).toThrow(
            /undefined/
        );
    });
});
