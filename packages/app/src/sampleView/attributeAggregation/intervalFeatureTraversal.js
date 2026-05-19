/**
 * Visits point or interval features that overlap the selected x interval.
 *
 * @param {Iterable<Record<string, any>>} data
 * @param {import("@genome-spy/core/types/encoder.js").Accessor} xAccessor
 * @param {import("@genome-spy/core/types/encoder.js").Accessor | undefined} x2Accessor
 * @param {string} hitTestMode
 * @param {number} start
 * @param {number} end
 * @param {(datum: Record<string, any>, weight: number) => void} visitor
 */
export function visitIntervalFeatures(
    data,
    xAccessor,
    x2Accessor,
    hitTestMode,
    start,
    end,
    visitor
) {
    const isPointFeature =
        !x2Accessor || (xAccessor && xAccessor.equals(x2Accessor));

    for (const datum of data) {
        const x = /** @type {number} */ (xAccessor(datum));
        if (isPointFeature) {
            if (x >= start && x <= end) {
                visitor(datum, 1);
            }
        } else {
            const x2 = /** @type {number} */ (x2Accessor(datum));
            const weight = getIntervalFeatureWeight(
                x,
                x2,
                start,
                end,
                hitTestMode
            );
            if (weight > 0) {
                visitor(datum, weight);
            }
        }
    }
}

/**
 * @param {number} x
 * @param {number} x2
 * @param {number} start
 * @param {number} end
 * @param {string} hitTestMode
 * @returns {number}
 */
function getIntervalFeatureWeight(x, x2, start, end, hitTestMode) {
    if (hitTestMode === "endpoints") {
        return (x >= start && x <= end) || (x2 >= start && x2 <= end) ? 1 : 0;
    } else if (hitTestMode === "encloses") {
        return x >= start && x2 <= end ? x2 - x : 0;
    } else {
        const overlapStart = Math.max(x, start);
        const overlapEnd = Math.min(x2, end);
        return Math.max(0, overlapEnd - overlapStart);
    }
}
