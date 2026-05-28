import { topK } from "@genome-spy/core/utils/topK.js";

/**
 * Returns stable example values from a larger candidate list.
 *
 * @param {unknown[]} values
 * @param {number} maxExamples
 * @returns {string[]}
 */
export function collectExampleValues(values, maxExamples) {
    const candidates = values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);

    return topK(candidates, maxExamples, hashString);
}

/**
 * @param {string} value
 * @returns {number}
 */
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
