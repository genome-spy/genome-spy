import { INDEX, LOCUS } from "./scaleResolutionConstants.js";

/**
 * @param {import("../spec/channel.js").Type | import("../spec/scale.js").ScaleType} type
 * @returns {boolean}
 */
export function isIndexLikeDomainType(type) {
    return type === INDEX || type === LOCUS;
}

/**
 * Converts a numeric user-facing inclusive interval into the internal half-open
 * form used by index-like scales.
 *
 * @param {import("../spec/channel.js").Type | import("../spec/scale.js").ScaleType} type
 * @param {number[]} interval
 * @returns {number[]}
 */
export function toInternalIndexLikeInterval(type, interval) {
    return isIndexLikeDomainType(type) ? expandUpperBound(interval) : interval;
}

/**
 * Converts an internal half-open interval into a user-facing inclusive form.
 *
 * @param {import("../spec/channel.js").Type | import("../spec/scale.js").ScaleType} type
 * @param {number[]} interval
 * @returns {number[]}
 */
export function toExternalIndexLikeInterval(type, interval) {
    return isIndexLikeDomainType(type) ? shrinkUpperBound(interval) : interval;
}

/**
 * @param {import("../spec/channel.js").Type | import("../spec/scale.js").ScaleType} type
 * @param {number[] | undefined} interval
 * @returns {number[] | undefined}
 */
export function toInternalIndexLikeDataDomain(type, interval) {
    return interval && isIndexLikeDomainType(type)
        ? expandUpperBound(interval)
        : interval;
}

/**
 * @param {number[]} interval
 * @returns {number[]}
 */
function expandUpperBound(interval) {
    return [interval[0], interval[1] + getDirection(interval)];
}

/**
 * @param {number[]} interval
 * @returns {number[]}
 */
function shrinkUpperBound(interval) {
    return [interval[0], interval[1] - getDirection(interval)];
}

/**
 * @param {number[]} interval
 * @returns {1 | -1}
 */
function getDirection(interval) {
    return interval[1] >= interval[0] ? 1 : -1;
}
