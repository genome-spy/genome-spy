/*
 * Open-addressing hash tables for WGSL lookups.
 * Tables are built on the CPU and uploaded as storage buffers.
 */

/** Sentinel key that marks an empty slot in the table. */
export const HASH_EMPTY_KEY = 0xffff_ffff;

/** Default maximum load factor for table sizing. */
export const DEFAULT_MAX_LOAD_FACTOR = 0.6;

const MAX_U32 = 0xffff_ffff;

/**
 * @typedef {object} HashTableBuildOptions
 * @property {number} [capacity] Power-of-two table size override.
 * @property {number} [maxLoadFactor] Maximum load factor before resizing.
 */

/**
 * @typedef {object} HashTableBuildResult
 * @property {Uint32Array} table Packed [key, value, ...] entries.
 * @property {number} capacity Table capacity (number of entries).
 * @property {number} size Number of stored entries.
 */

/**
 * 32-bit integer hash for u32 keys. Keep in sync with WGSL hash32.
 *
 * @param {number} value
 * @returns {number}
 */
export function hash32(value) {
    let v = value >>> 0;
    v ^= v >>> 16;
    v = Math.imul(v, 0x7feb352d);
    v ^= v >>> 15;
    v = Math.imul(v, 0x846ca68b);
    v ^= v >>> 16;
    return v >>> 0;
}

/**
 * Build a hash table for a set of keys (membership checks).
 *
 * @param {Iterable<number>} keys
 * @param {HashTableBuildOptions} [options]
 * @returns {HashTableBuildResult}
 */
export function buildHashTableSet(keys, options) {
    /** @type {Array<[number, number]>} */
    const entries = [];
    for (const key of keys) {
        entries.push([key, 1]);
    }
    return buildHashTableMap(entries, options);
}

/**
 * Build a hash table for key/value pairs (sparse to dense mapping).
 *
 * @param {Iterable<[number, number]>} entries
 * @param {HashTableBuildOptions} [options]
 * @returns {HashTableBuildResult}
 */
export function buildHashTableMap(entries, options = {}) {
    /** @type {Array<[number, number]>} */
    const normalized = Array.from(entries);
    const size = normalized.length;
    const maxLoadFactor = options.maxLoadFactor ?? DEFAULT_MAX_LOAD_FACTOR;
    if (!(maxLoadFactor > 0 && maxLoadFactor < 1)) {
        throw new Error("maxLoadFactor must be between 0 and 1.");
    }
    const capacity =
        options.capacity ?? nextPow2(Math.ceil(size / maxLoadFactor));
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
        throw new Error("capacity must be a positive power of two.");
    }
    if ((capacity & (capacity - 1)) !== 0) {
        throw new Error("capacity must be a power of two.");
    }

    const table = new Uint32Array(capacity * 2);
    for (let i = 0; i < capacity; i += 1) {
        table[i * 2] = HASH_EMPTY_KEY;
    }

    const mask = capacity - 1;
    for (const [key, value] of normalized) {
        const normalizedKey = normalizeU32(key, "key");
        if (normalizedKey === HASH_EMPTY_KEY) {
            throw new Error(
                "Hash table keys must not equal the empty sentinel (0xffffffff)."
            );
        }
        const normalizedValue = normalizeU32(value, "value");
        let index = hash32(normalizedKey) & mask;
        let inserted = false;
        for (let probe = 0; probe < capacity; probe += 1) {
            const offset = index * 2;
            const existingKey = table[offset];
            if (
                existingKey === HASH_EMPTY_KEY ||
                existingKey === normalizedKey
            ) {
                table[offset] = normalizedKey;
                table[offset + 1] = normalizedValue;
                inserted = true;
                break;
            }
            index = (index + 1) & mask;
        }
        if (!inserted) {
            throw new Error(
                "Hash table insertion failed. Increase capacity or lower load factor."
            );
        }
    }

    return { table, capacity, size };
}

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function normalizeU32(value, label) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_U32) {
        throw new Error(`${label} must be a non-negative u32.`);
    }
    return value >>> 0;
}

/**
 * @param {number} value
 * @returns {number}
 */
function nextPow2(value) {
    let v = Math.max(1, value);
    v -= 1;
    v |= v >>> 1;
    v |= v >>> 2;
    v |= v >>> 4;
    v |= v >>> 8;
    v |= v >>> 16;
    return v + 1;
}
