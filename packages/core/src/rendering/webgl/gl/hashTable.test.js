import { describe, expect, it } from "vitest";
import {
    buildHashTableSet,
    computeHashTextureDimensions,
    HASH_EMPTY_KEY,
    hash32,
} from "./hashTable.js";

/**
 * @param {Uint32Array} table
 * @param {number} key
 * @returns {boolean}
 */
function hashContains(table, key) {
    const capacity = table.length;
    const mask = capacity - 1;
    const normalized = key >>> 0;
    let index = hash32(normalized) & mask;

    for (let probe = 0; probe < capacity; probe += 1) {
        const entry = table[index];
        if (entry === normalized) {
            return true;
        }
        if (entry === HASH_EMPTY_KEY) {
            return false;
        }
        index = (index + 1) & mask;
    }

    return false;
}

/**
 * @param {number} mask
 * @param {number} count
 * @returns {number[]}
 */
function findCollidingKeys(mask, count) {
    /** @type {Map<number, number[]>} */
    const buckets = new Map();

    for (let key = 1; key < 100_000; key += 1) {
        const bucket = hash32(key) & mask;
        const values = buckets.get(bucket) ?? [];
        values.push(key);
        buckets.set(bucket, values);
        if (values.length === count) {
            return values;
        }
    }

    throw new Error("Unable to find colliding keys for the requested mask.");
}

describe("hashTable", () => {
    it("builds a sparse set table with membership lookups", () => {
        const keys = [1, 7, 123, 2_000_000_000, 3_500_000_000];
        const { table } = buildHashTableSet(keys);

        const queries = [0, 1, 2, 7, 123, 2_000_000_000, 3_500_000_000];
        for (const query of queries) {
            expect(hashContains(table, query)).toBe(keys.includes(query));
        }
    });

    it("resolves collisions with linear probing", () => {
        // Force multiple keys into the same bucket to exercise probing.
        const collidingKeys = findCollidingKeys(0b111, 3);
        const { table, capacity } = buildHashTableSet(collidingKeys, {
            capacity: 8,
        });

        expect(capacity).toBe(8);
        for (const key of collidingKeys) {
            expect(hashContains(table, key)).toBe(true);
        }
    });

    it("marks empty sets with a single sentinel slot", () => {
        const { table, capacity, size } = buildHashTableSet([]);

        expect(size).toBe(0);
        expect(capacity).toBe(1);
        expect(table).toEqual(new Uint32Array([HASH_EMPTY_KEY]));
    });

    it("rejects sentinel values as keys", () => {
        expect(() => buildHashTableSet([HASH_EMPTY_KEY])).toThrow(
            /must not equal the empty sentinel/
        );
    });

    it("computes 2D dimensions for larger capacities", () => {
        const selectionSize = 100_000;
        const { capacity } = buildHashTableSet(
            Array.from({ length: selectionSize }, (_, i) => i + 1)
        );
        const dims = computeHashTextureDimensions(capacity, 16384);

        expect(capacity).toBe(262144);
        expect(dims).toEqual({ width: 16384, height: 16 });
        expect(dims.width * dims.height).toBe(capacity);
    });

    it("rejects capacities that exceed max texture area", () => {
        expect(() => computeHashTextureDimensions(256, 8)).toThrow(
            /exceeds maximum texture capacity/
        );
    });
});
