import { expect, test } from "vitest";
import { topK } from "./topK.js";

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

test("topK returns top k objects in priority order within a start-end range", () => {
    const arr = [0, 9, 1, 8, 2, 7, 3, 6, 4, 5].map((x) => ({ priority: x }));
    const priorityAccessor = (/** @type {{priority: number}} */ d) =>
        d.priority;

    // Range: indices 2 to 8 (1,8,2,7,3,6)
    expect(topK(arr, 2, priorityAccessor, 2, 8)).toEqual([
        { priority: 8 },
        { priority: 7 },
    ]);

    // Range: indices 4 to 10 (2,7,3,6,4,5)
    expect(topK(arr, 3, priorityAccessor, 4, 10)).toEqual([
        { priority: 7 },
        { priority: 6 },
        { priority: 5 },
    ]);

    // Range: indices 0 to 3 (0,9,1)
    expect(topK(arr, 2, priorityAccessor, 0, 3)).toEqual([
        { priority: 9 },
        { priority: 1 },
    ]);
});

test("topK returns empty array if start >= end", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(topK(arr, 3, (x) => x, 4, 4)).toEqual([]);
    expect(topK(arr, 3, (x) => x, 5, 5)).toEqual([]);
    expect(topK(arr, 3, (x) => x, 6, 6)).toEqual([]);
});

test("topK works with negative and zero priorities in a range", () => {
    const arr = [-10, 0, 5, -2, 3, 0, -1];
    expect(topK(arr, 2, (x) => x, 1, 6)).toEqual([5, 3]);
    expect(topK(arr, 3, (x) => x, 0, 4)).toEqual([5, 0, -2]);
});
