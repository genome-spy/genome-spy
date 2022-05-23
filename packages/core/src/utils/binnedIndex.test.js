import { describe, expect, test } from "vitest";
import { createBinningRangeIndexer } from "./binnedIndex.js";

describe("Binning Indexer", () => {
    test("Points are binned correctly", () => {
        const items = [0, 1, 4, 10, 35, 36, 80];
        const indexer = createBinningRangeIndexer(10, [0, 100], (x) => x);

        items.forEach((i) => indexer(i, i, i + 1));

        const index = indexer.getIndex();

        expect(index(0, 1)).toEqual([0, 5]);
        expect(index(1, 2)).toEqual([0, 5]);
        expect(index(1, 15)).toEqual([0, 11]);
        expect(index(10, 15)).toEqual([10, 11]);
        expect(index(11, 38)).toEqual([10, 37]);
        expect(index(11, 45)).toEqual([10, 37]);
        expect(index(40, 85)).toEqual([80, 81]);
        expect(index(90, 100)).toEqual([81, 81]);
    });

    test("Non-overlapping ranges are binned correctly", () => {
        const items = [
            [0, 5],
            [25, 50],
            [50, 55],
        ];
        const indexer = createBinningRangeIndexer(
            10,
            [0, 100],
            (x) => x[0],
            (x) => x[1]
        );

        items.forEach((x) => indexer(x, x[0], x[1]));

        const index = indexer.getIndex();

        // TODO: More tests. Doesn't work 100%

        expect(index(0, 1)).toEqual([0, 5]);
        expect(index(3, 40)).toEqual([0, 50]);
        expect(index(6, 40)).toEqual([0, 50]);
        // fails: expect(index(50, 57)).toEqual([50, 55]);
    });

    test("Overlapping ranges are binned correctly", () => {
        const items = [
            [10, 30],
            [25, 50],
        ];
        const indexer = createBinningRangeIndexer(
            10,
            [0, 100],
            (x) => x[0],
            (x) => x[1]
        );

        items.forEach((x) => indexer(x, x[0], x[1]));

        const index = indexer.getIndex();

        // TODO: More tests. Doesn't work 100%

        expect(index(0, 5)).toEqual([10, 10]);
        expect(index(0, 15)).toEqual([10, 30]);
        expect(index(27, 40)).toEqual([10, 50]);
        expect(index(40, 50)).toEqual([25, 50]);
        expect(index(40, 80)).toEqual([25, 50]);
        expect(index(10, 29)).toEqual([10, 50]);
    });
});
