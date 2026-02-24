/** Sentinel key that marks an empty hash slot. */
export const HASH_EMPTY_KEY = 0xffff_ffff;

/** Default maximum load factor for table sizing. */
export const DEFAULT_MAX_LOAD_FACTOR = 0.6;

const MAX_U32 = 0xffff_ffff;

/**
 * Build-time options for sizing the hash table.
 *
 * @typedef {object} HashTableBuildOptions
 * @property {number} [capacity] Power-of-two table size override.
 * @property {number} [maxLoadFactor] Maximum load factor before resizing.
 */

/**
 * Packed table payload ready for WebGL texture upload.
 *
 * @typedef {object} HashTableBuildResult
 * @property {Uint32Array} table Hash table slots that contain keys.
 * @property {number} capacity Table capacity (number of slots).
 * @property {number} size Number of stored keys.
 */

/**
 * 32-bit integer hash for u32 keys. Keep in sync with GLSL hash32.
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
 * Build a hash table for set membership checks.
 *
 * @param {Iterable<number>} keys
 * @param {HashTableBuildOptions} [options]
 * @returns {HashTableBuildResult}
 */
export function buildHashTableSet(keys, options = {}) {
    const normalized = Array.from(keys, (key) => normalizeU32(key, "key"));
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

    const table = new Uint32Array(capacity);
    table.fill(HASH_EMPTY_KEY);

    const mask = capacity - 1;
    for (const key of normalized) {
        if (key === HASH_EMPTY_KEY) {
            throw new Error(
                "Hash table keys must not equal the empty sentinel (0xffffffff)."
            );
        }
        let index = hash32(key) & mask;
        let inserted = false;

        for (let probe = 0; probe < capacity; probe += 1) {
            const existingKey = table[index];
            if (existingKey === HASH_EMPTY_KEY || existingKey === key) {
                table[index] = key;
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
 * Computes a 2D texture layout for a power-of-two hash table capacity.
 *
 * The returned dimensions satisfy `width * height === capacity`.
 *
 * @param {number} capacity
 * @param {number} maxTextureSize
 * @returns {{ width: number, height: number }}
 */
export function computeHashTextureDimensions(capacity, maxTextureSize) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
        throw new Error("capacity must be a positive integer.");
    }
    if ((capacity & (capacity - 1)) !== 0) {
        throw new Error("capacity must be a power of two.");
    }
    if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1) {
        throw new Error("maxTextureSize must be a positive integer.");
    }

    const maxSlots = maxTextureSize * maxTextureSize;
    if (capacity > maxSlots) {
        throw new Error(
            "Selection hash table exceeds maximum texture capacity."
        );
    }

    const maxPow2Width = 1 << Math.floor(Math.log2(maxTextureSize));
    const width = Math.min(capacity, maxPow2Width);
    const height = capacity / width;

    if (height > maxTextureSize) {
        throw new Error(
            "Selection hash table dimensions exceed maximum texture size."
        );
    }

    return { width, height };
}

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function normalizeU32(value, label) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_U32) {
        throw new Error(label + " must be a non-negative u32.");
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
