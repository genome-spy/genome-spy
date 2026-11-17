import { expect, test } from "vitest";
import radixSort, { radixSortIntoLookupArray } from "./radixSort.js";

/**
 * Generates a random array of unsigned integers.
 *
 * @param {number} length
 * @param {number} [seed]
 */
function generateArray(length, seed = 123456789) {
    const arr = new Array(length);

    for (let i = 0; i < length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        arr[i] = Math.floor(((seed >>> 0) / 2 ** 32) * 10_000_000_000);
    }

    return arr;
}

const cases = [
    [],
    [0],
    [Number.MAX_SAFE_INTEGER],
    [0, 1, 1, 2 ** 32, Number.MAX_SAFE_INTEGER],
    [10000, 100, 1000, 10, 1],
    [9, 4, 9, 1, 4],
    // Include the digit crossing bit 31, higher digits, and the largest key.
    [
        2 ** 22 - 1,
        2 ** 22,
        2 ** 31,
        2 ** 32 - 1,
        2 ** 32,
        2 ** 33,
        2 ** 44,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER - 1,
        0,
    ],
];

test.each(cases)("Sort returns a sorted ordinary array: %j", (...arr) => {
    const expected = arr.slice().sort((a, b) => a - b);
    const result = radixSort(arr);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(expected);
});

test("Sort returns already sorted input unchanged", () => {
    const arr = [0, 1, 1, 2 ** 32, Number.MAX_SAFE_INTEGER];

    expect(radixSort(arr)).toBe(arr);
});

test.each(cases)(
    "Lookup permutation preserves keys and stable positions: %j",
    (...arr) => {
        const original = arr.slice();
        const expected = Array.from(arr.keys()).sort((a, b) => arr[a] - arr[b]);
        const lookup = radixSortIntoLookupArray(arr);

        expect(lookup).toBeInstanceOf(Uint32Array);
        expect(Array.from(lookup)).toEqual(expected);
        expect(arr).toEqual(original);
    }
);

test("Both sorts match reference sorts across mixed safe-integer keys", () => {
    for (let seed = 1; seed <= 20; seed++) {
        const arr = generateArray(1000, seed).map((value, i) =>
            i % 2 ? Number.MAX_SAFE_INTEGER - value : value
        );
        for (let i = 1; i < arr.length; i += 20) {
            arr[i] = arr[i - 1];
        }

        const expected = Array.from(arr.keys()).sort((a, b) => arr[a] - arr[b]);
        expect(Array.from(radixSortIntoLookupArray(arr))).toEqual(expected);
        const sorted = arr.slice().sort((a, b) => a - b);
        expect(radixSort(arr)).toEqual(sorted);
    }
});
