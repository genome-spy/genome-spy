import { expect, test } from "vitest";
import radixSort, { radixSortIntoLookupArray } from "./radixSort.js";

/**
 * Checks that numbers in an array are in ascending order.

 * @param {number[]} arr An array of unsigned integers
 */
function isSorted(arr) {
    for (let i = 1; i < arr.length; i++) {
        if (arr[i - 1] > arr[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Generates a random array of unsigned integers.
 *
 * @param {number} length
 */
function generateArray(length) {
    const arr = new Array(length);

    for (let i = 0; i < length; i++) {
        arr[i] = Math.floor(Math.random() * 10_000_000_000);
    }

    return arr;
}

test("Radix Sort correctly sorts numbers", () => {
    expect(isSorted(radixSort([1, 2, 3]))).toBeTruthy();
    expect(isSorted(radixSort([3, 2, 1]))).toBeTruthy();
    expect(isSorted(radixSort([123, 1234567, 12, 1, 1234]))).toBeTruthy();
    expect(isSorted(radixSort(generateArray(1_000_000)))).toBeTruthy();
});

test("Lookup", () => {
    expect(radixSortIntoLookupArray([1, 2, 3])).toEqual([0, 1, 2]);
    expect(radixSortIntoLookupArray([3, 2, 1])).toEqual([2, 1, 0]);
    expect(radixSortIntoLookupArray([10000, 100, 1000, 10, 1])).toEqual([
        4, 3, 1, 2, 0,
    ]);

    const arr = generateArray(1_000_000);
    const lookup = radixSortIntoLookupArray(arr);
    expect(isSorted(arr.map((_, i) => arr[lookup[i]]))).toBeTruthy();
});
