import { HASH_EMPTY_KEY } from "../../utils/hashTable.js";

/**
 * @param {string} name
 * @param {"band"|"ordinal"} scaleType
 * @param {ArrayLike<number>|undefined} domain
 * @returns {number[] | null}
 */
export function normalizeOrdinalDomain(name, scaleType, domain) {
    if (!domain) {
        return null;
    }
    const values = Array.from(domain, (value) => {
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
            throw new Error(
                `Ordinal domain on "${name}" requires integer u32 values.`
            );
        }
        if (value < 0 || value > HASH_EMPTY_KEY) {
            throw new Error(
                `Ordinal domain on "${name}" must fit in u32 values.`
            );
        }
        if (value === HASH_EMPTY_KEY) {
            throw new Error(
                `Ordinal domain on "${name}" must not contain 0xffffffff.`
            );
        }
        return value >>> 0;
    });
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) {
            throw new Error(
                `Ordinal domain on "${name}" must not contain duplicates.`
            );
        }
        seen.add(value);
    }
    return values;
}
