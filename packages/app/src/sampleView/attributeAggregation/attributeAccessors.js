import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";
import { createDatumAtAccessor } from "../datumLookup.js";
import { isIntervalSource, isLiteralInterval } from "../sampleViewTypes.js";
import {
    aggregateCount,
    aggregateMax,
    aggregateMin,
    aggregateVariance,
    aggregateWeightedMean,
} from "./attributeAggregation.js";

/**
 * @param {import("@genome-spy/core/scales/scaleResolution.js").default} scaleResolution
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | import("@genome-spy/core/spec/genome.js").ChromosomalLocus} value
 * @returns {import("@genome-spy/core/spec/channel.js").Scalar}
 */
function toScalar(scaleResolution, value) {
    if (!isChromosomalLocus(value)) {
        return value;
    }

    const scale = scaleResolution.getScale();
    const genome = "genome" in scale ? scale.genome() : undefined;
    if (!genome) {
        throw new Error(
            "Encountered a chromosomal locus but no genome is available!"
        );
    }

    return genome.toContinuous(value.chrom, value.pos);
}

/**
 * @param {import("@genome-spy/core/scales/scaleResolution.js").default} scaleResolution
 * @param {import("../sampleViewTypes.js").ViewAttributeSpecifier | import("../sampleViewTypes.js").IntervalCarrier} specifier
 * @returns {[import("@genome-spy/core/spec/channel.js").Scalar, import("@genome-spy/core/spec/channel.js").Scalar]}
 */
function normalizeInterval(scaleResolution, specifier) {
    if ("interval" in specifier) {
        if (isLiteralInterval(specifier.interval)) {
            return [
                toScalar(scaleResolution, specifier.interval[0]),
                toScalar(scaleResolution, specifier.interval[1]),
            ];
        } else if (isIntervalSource(specifier.interval)) {
            throw new Error(
                "Interval source specifiers are not supported yet."
            );
        } else {
            throw new Error("Unsupported interval reference.");
        }
    } else if ("locus" in specifier) {
        const scalar = toScalar(scaleResolution, specifier.locus);
        return [scalar, scalar];
    } else {
        throw new Error("Unsupported view attribute specifier.");
    }
}

/**
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("../sampleViewTypes.js").ViewAttributeSpecifier} specifier
 * @returns {import("../types.js").AttributeInfo["accessor"]}
 */
/**
 * Builds a per-sample accessor for point or interval-based view attributes.
 *
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("../sampleViewTypes.js").ViewAttributeSpecifier} specifier
 * @returns {import("../types.js").AttributeInfo["accessor"]}
 */
export function createViewAttributeAccessor(view, specifier) {
    const xType = /** @type {any} */ (view.getEncoding()?.x)?.type;
    if (!xType || !["quantitative", "index", "locus"].includes(xType)) {
        throw new Error(
            "Interval aggregation requires an x encoding of type quantitative, index, or locus!"
        );
    }
    const scaleResolution = view.getScaleResolution("x");
    const interval = normalizeInterval(scaleResolution, specifier);
    const collector = view.getCollector();
    const xAccessor = view.getDataAccessor("x");
    const x2Accessor = view.getDataAccessor("x2");
    const hitTestMode = view.mark?.defaultHitTestMode ?? "intersects";
    // Missing x2 or equal accessors imply point features, so treat x and x2 as the same value.
    const isPointFeature =
        !x2Accessor || (xAccessor && xAccessor.equals(x2Accessor));

    if (!collector || !xAccessor) {
        return () => undefined;
    }

    if (!("aggregation" in specifier)) {
        const datumAt = createDatumAtAccessor(view, collector);
        return (sampleId) => datumAt(sampleId, interval[0])?.[specifier.field];
    }

    const valueAccessor = (/** @type {any} */ datum) => datum[specifier.field];
    if (typeof interval[0] !== "number" || typeof interval[1] !== "number") {
        throw new Error("Interval aggregation requires numeric coordinates!");
    }
    const [start, end] = /** @type {[number, number]} */ (
        interval[0] <= interval[1] ? interval : [interval[1], interval[0]]
    );
    const op = specifier.aggregation.op;
    const needsWeights = op === "weightedMean" || op === "variance";

    return (sampleId) => {
        const data = collector.facetBatches.get(asArray(sampleId));
        if (!data?.length) {
            return op === "count" ? 0 : undefined;
        }

        /** @type {number[]} */
        const values = [];
        /** @type {number[]} */
        const weights = [];

        if (isPointFeature) {
            for (let i = 0; i < data.length; i++) {
                const datum = data[i];
                const x = /** @type {number} */ (xAccessor(datum));
                if (x >= start && x <= end) {
                    values.push(valueAccessor(datum));
                    if (needsWeights) {
                        weights.push(1);
                    }
                }
            }
        } else {
            for (let i = 0; i < data.length; i++) {
                const datum = data[i];
                const x = /** @type {number} */ (xAccessor(datum));
                const x2 = /** @type {number} */ (x2Accessor(datum));
                if (hitTestMode === "endpoints") {
                    if (
                        (x >= start && x <= end) ||
                        (x2 >= start && x2 <= end)
                    ) {
                        values.push(valueAccessor(datum));
                        if (needsWeights) {
                            weights.push(1);
                        }
                    }
                } else if (hitTestMode === "encloses") {
                    if (x >= start && x2 <= end) {
                        values.push(valueAccessor(datum));
                        if (needsWeights) {
                            weights.push(x2 - x);
                        }
                    }
                } else {
                    // intersects
                    const overlapStart = Math.max(x, start);
                    const overlapEnd = Math.min(x2, end);
                    if (overlapEnd > overlapStart) {
                        values.push(valueAccessor(datum));
                        if (needsWeights) {
                            weights.push(overlapEnd - overlapStart);
                        }
                    }
                }
            }
        }

        switch (op) {
            case "count":
                return aggregateCount(values);
            case "min":
                return aggregateMin(values);
            case "max":
                return aggregateMax(values);
            case "weightedMean":
                return aggregateWeightedMean(values, weights);
            case "variance":
                return aggregateVariance(values, weights);
            default:
                throw new Error("Unknown aggregation op: " + op);
        }
    };
}
