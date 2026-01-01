import { describe, expect, it } from "vitest";
import {
    buildHashTableMap,
    buildHashTableSet,
    HASH_EMPTY_KEY,
    hash32,
} from "./hashTable.js";

/**
 * @param {Uint32Array} table
 * @param {number} key
 * @returns {number}
 */
const lookup = (table, key) => {
    const capacity = table.length / 2;
    const mask = capacity - 1;
    const normalizedKey = key >>> 0;
    let index = hash32(normalizedKey) & mask;
    for (let probe = 0; probe < capacity; probe += 1) {
        const offset = index * 2;
        const entryKey = table[offset];
        if (entryKey === HASH_EMPTY_KEY) {
            return HASH_EMPTY_KEY;
        }
        if (entryKey === normalizedKey) {
            return table[offset + 1];
        }
        index = (index + 1) & mask;
    }
    return HASH_EMPTY_KEY;
};

describe("hashTable utils", () => {
    it("buildHashTableSet resolves membership for sparse keys", () => {
        const keys = [1, 7, 123, 2_000_000_000, 3_500_000_000];
        const { table } = buildHashTableSet(keys);

        const present = new Set(keys.map((key) => key >>> 0));
        const queries = [
            0, 1, 2, 7, 123, 2_000_000_000, 3_500_000_000, 3_999_999_999,
        ];
        for (const query of queries) {
            const result = lookup(table, query);
            if (present.has(query >>> 0)) {
                expect(result).toBe(1);
            } else {
                expect(result).toBe(HASH_EMPTY_KEY);
            }
        }
    });

    it("buildHashTableMap maps sparse keys to dense indices", () => {
        /** @type {Array<[number, number]>} */
        const entries = [
            [42, 0],
            [7, 1],
            [2_000_000_000, 2],
            [3_700_000_000, 3],
        ];
        const { table } = buildHashTableMap(entries);

        const expected = new Map(entries.map(([key, value]) => [key, value]));
        const queries = [7, 42, 2_000_000_000, 3_700_000_000, 4_000_000_000];
        for (const query of queries) {
            const result = lookup(table, query);
            if (expected.has(query)) {
                expect(result).toBe(expected.get(query));
            } else {
                expect(result).toBe(HASH_EMPTY_KEY);
            }
        }
    });
});
