import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";

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

/**
 * @param {import("@genome-spy/core/scales/scaleResolution.js").default} scaleResolution
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | import("@genome-spy/core/spec/genome.js").ChromosomalLocus} value
 * @returns {import("@genome-spy/core/spec/channel.js").Scalar}
 */
export function toScalar(scaleResolution, value) {
    if (!isChromosomalLocus(value)) {
        return value;
    }

    const scale = scaleResolution.getScale();
    const genome = "genome" in scale ? scale.genome() : undefined;
    if (!genome) {
        throw new Error(
            "Encountered a chromosomal locus but no genome is available."
        );
    }

    return genome.toContinuous(value.chrom, value.pos);
}

/**
 * @param {import("@genome-spy/core/scales/scaleResolution.js").default} scaleResolution
 * @param {import("../types.js").Interval} interval
 * @param {string} errorMessage
 * @returns {[number, number]}
 */
export function normalizeNumericInterval(
    scaleResolution,
    interval,
    errorMessage
) {
    const start = toScalar(scaleResolution, interval[0]);
    const end = toScalar(scaleResolution, interval[1]);
    if (typeof start !== "number" || typeof end !== "number") {
        throw new Error(errorMessage);
    }

    return start <= end ? [start, end] : [end, start];
}
