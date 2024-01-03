import { describe, expect, test } from "vitest";
import { createBinningRangeIndexer } from "./binnedIndex.js";

describe("Binning Indexer", () => {
    test("Single point is binned correctly", () => {
        const items = [25];
        const indexer = createBinningRangeIndexer(10, [0, 100], (x) => x);

        // Each item uses two vertices
        items.forEach((x, i) => indexer(x, i * 2, (i + 1) * 2));

        const index = indexer.getIndex();

        expect(index(1, 4)).toEqual([0, 0]);
        expect(index(23, 27)).toEqual([0, 2]);
        expect(index(13, 37)).toEqual([0, 2]);
        // TODO: MAX_INT could be replaced with the actual maximum vertex number
        expect(index(40, 42)).toEqual([2147483647, 2147483647]);
    });

    test("Multiple points are binned correctly", () => {
        const items = [0, 1, 4, 10, 35, 35, 36, 80];
        const indexer = createBinningRangeIndexer(10, [0, 100], (x) => x);

        // Each item uses two vertices
        items.forEach((x, i) => indexer(x, i * 2, (i + 1) * 2));

        const index = indexer.getIndex();

        expect(index(0, 0)).toEqual([0, 6]);
        expect(index(0, 1)).toEqual([0, 6]);
        expect(index(1, 2)).toEqual([0, 6]);
        expect(index(1, 15)).toEqual([0, 8]);
        expect(index(3, 6)).toEqual([0, 6]);
        expect(index(10, 15)).toEqual([6, 8]);
        expect(index(11, 38)).toEqual([6, 14]);
        expect(index(11, 45)).toEqual([6, 14]);
        expect(index(34, 36)).toEqual([8, 14]);
        expect(index(35.5, 36.5)).toEqual([8, 14]);
        expect(index(40, 50)).toEqual([14, 14]);
        expect(index(40, 85)).toEqual([14, 16]);
        expect(index(90, 100)).toEqual([16, 16]);

        expect(index(0, 100)).toEqual([0, 16]);
        expect(index(-1, 100)).toEqual([0, 16]);
        expect(index(0, 101)).toEqual([0, 16]);
    });

    test("Non-overlapping ranges are binned correctly", () => {
        const items = [
            [0, 5],
            [25, 48],
            [50, 55],
            [64, 67],
            [72, 75],
            [75, 78],
            [86, 90],
            [90, 93],
        ];
        const indexer = createBinningRangeIndexer(
            10,
            [0, 100],
            (x) => x[0],
            (x) => x[1]
        );

        // Each item uses two vertices
        items.forEach((x, i) => indexer(x, i * 2, (i + 1) * 2));

        const index = indexer.getIndex();

        expect(index(0, 1)).toEqual([0, 2]);
        expect(index(3, 40)).toEqual([0, 4]);
        expect(index(6, 40)).toEqual([0, 4]);
        expect(index(15, 30)).toEqual([2, 4]);
        expect(index(50, 57)).toEqual([4, 6]);
        expect(index(62, 69)).toEqual([6, 8]);
        expect(index(69, 71)).toEqual([6, 12]);
        expect(index(69, 79)).toEqual([6, 12]);

        expect(index(80, 90)).toEqual([12, 14]);
        expect(index(90, 100)).toEqual([14, 16]);

        expect(index(0, 99)).toEqual([0, 16]);
        expect(index(0, 100)).toEqual([0, 16]);
    });

    test("Overlapping ranges with the same start coordinate are binned correctly", () => {
        const items = [
            // Increasing lengths
            [0, 5],
            [0, 64],
            [0, 80],
            // Decreasing lengths
            [100, 191],
            [100, 167],
            [100, 123],
        ];
        const indexer = createBinningRangeIndexer(
            100,
            [0, 1000],
            (x) => x[0],
            (x) => x[1]
        );

        // Each item uses two vertices
        items.forEach((x, i) => indexer(x, i * 2, (i + 1) * 2));

        const index = indexer.getIndex();

        expect(index(0, 1)).toEqual([0, 6]);
        expect(index(3, 40)).toEqual([0, 6]);
        expect(index(0, 100)).toEqual([0, 6]);
        expect(index(77, 78)).toEqual([4, 6]);

        expect(index(90, 205)).toEqual([6, 12]);
        expect(index(111, 115)).toEqual([6, 12]);
        // Not optimal. Should be [6, 8], but [6, 12] is not wrong
        expect(index(180, 190)).toEqual([6, 12]);
    });

    test("Overlapping ranges are binned correctly", () => {
        const items = [
            [10, 30],
            [25, 50],

            [102, 129],
            [112, 139],
            [121, 149],
        ];
        const indexer = createBinningRangeIndexer(
            100,
            [0, 1000],
            (x) => x[0],
            (x) => x[1]
        );

        items.forEach((x, i) => indexer(x, i * 2, (i + 1) * 2));

        const index = indexer.getIndex();

        // TODO: More tests

        expect(index(0, 5)).toEqual([0, 0]);
        expect(index(0, 15)).toEqual([0, 2]);
        expect(index(27, 40)).toEqual([0, 4]);
        expect(index(40, 50)).toEqual([2, 4]);
        expect(index(40, 80)).toEqual([2, 4]);
        expect(index(10, 29)).toEqual([0, 4]);

        expect(index(90, 160)).toEqual([4, 10]);
        expect(index(115, 116)).toEqual([4, 8]);
        expect(index(135, 145)).toEqual([6, 10]);
    });

    test("Unordered ranges disable the index", () => {
        const items = [
            [10, 30],
            [25, 50],

            [112, 139],
            [102, 129], // <- Unordered!
            [121, 149],
        ];
        const indexer = createBinningRangeIndexer(
            100,
            [0, 1000],
            (x) => x[0],
            (x) => x[1]
        );

        items.forEach((x, i) => indexer(x, i * 2, (i + 1) * 2));

        const index = indexer.getIndex();

        expect(index).toBeUndefined();
    });

    test("Inverted ranges disable the index", () => {
        const items = [
            [10, 30],
            [25, 50],

            [102, 129],
            [139, 112], // <- Inverted!
            [121, 149],
        ];
        const indexer = createBinningRangeIndexer(
            100,
            [0, 1000],
            (x) => x[0],
            (x) => x[1]
        );

        items.forEach((x, i) => indexer(x, i * 2, (i + 1) * 2));

        const index = indexer.getIndex();

        expect(index).toBeUndefined();
    });
});
