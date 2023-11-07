import { expect, test } from "vitest";
import { range } from "d3-array";
import { topK, topKSlice } from "./topK.js";

test("topK returns top k numbers in priority order", () => {
    /** @param {number} x */
    const priorityAccessor = (x) => x;

    expect(topK([1, 2, 3], 3, priorityAccessor)).toEqual([3, 2, 1]);
    expect(topK([1, 2, 3], 1, priorityAccessor)).toEqual([3]);
    expect(topK([1, 2, 3], 6, priorityAccessor)).toEqual([3, 2, 1]);
    expect(topK([1, 2, 3, 4, 5, 6], 3, priorityAccessor)).toEqual([6, 5, 4]);
    expect(topK([0, 9, 1, 8, 2, 7, 3, 6, 4, 5], 3, priorityAccessor)).toEqual([
        9, 8, 7,
    ]);
    expect(topK([1, 1, 1], 3, priorityAccessor)).toEqual([1, 1, 1]);
});

test("topK returns top k objects in priority order", () => {
    /** @param {{priority: number}} d */
    const priorityAccessor = (d) => d.priority;

    expect(
        topK(
            [0, 9, 1, 8, 2, 7, 3, 6, 4, 5].map((x) => ({ priority: x })),
            3,
            priorityAccessor
        )
    ).toEqual([9, 8, 7].map((x) => ({ priority: x })));
});

test("topK returns top k objects in priority order with large datasets", () => {
    /** @param {number} x */
    const priorityAccessor = (x) => x;

    const n = 10000;
    const bigArray = range(n).map((x) => Math.floor(Math.random() * 100));
    const sortedBigArray = bigArray.slice().sort((a, b) => b - a);

    for (let k = 0; k < 13000; k += 1000) {
        expect(topK(bigArray, k, priorityAccessor)).toEqual(
            sortedBigArray.slice(0, k)
        );
    }
});

test("topKSlice returns top k indexes in priority order", () => {
    expect(topKSlice([0, 1, 2], 3)).toEqual([2, 1, 0]);
    expect(topKSlice([1, 2, 3], 3)).toEqual([2, 1, 0]);
    expect(topKSlice([0, 1, 2], 1)).toEqual([2]);
    expect(topKSlice([0, 1, 2], 6)).toEqual([2, 1, 0]);
    expect(topKSlice([0, 1, 2, 3, 4, 5], 3)).toEqual([5, 4, 3]);
    expect(topKSlice([0, 9, 1, 8, 2, 7, 3, 6, 4, 5], 3)).toEqual([1, 3, 5]);
    expect(new Set(topKSlice([1, 1, 1, 2, 2, 2], 3))).toEqual(
        new Set([3, 4, 5])
    );
});

test("topKSlice returns top k indexes from a slice in priority order", () => {
    expect(topKSlice([0, 1, 2, 3, 4, 5], 2, 1, 5)).toEqual([4, 3]);
    expect(topKSlice([0, 9, 1, 8, 2, 7, 3, 6, 4, 5], 3, 1, 5)).toEqual([
        1, 3, 4,
    ]);
});
