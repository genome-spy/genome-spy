import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";
import { createDatumAtAccessor } from "../datumLookup.js";
import { resolveIntervalReference } from "../intervalReferenceResolver.js";
import { createFeatureFilterPredicate } from "../../utils/predicates/featureFilter.js";
import {
    aggregateCount,
    aggregateMax,
    aggregateMin,
    aggregateVariance,
    aggregateWeightedMean,
} from "./attributeAggregation.js";
import { visitIntervalFeatures } from "./intervalFeatureTraversal.js";

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
 * @param {import("@genome-spy/core/view/view.js").default | undefined} root
 * @returns {[import("@genome-spy/core/spec/channel.js").Scalar, import("@genome-spy/core/spec/channel.js").Scalar]}
 */
function normalizeInterval(scaleResolution, specifier, root) {
    if ("interval" in specifier) {
        const interval = resolveIntervalReference(root, specifier.interval);
        return [
            toScalar(scaleResolution, interval[0]),
            toScalar(scaleResolution, interval[1]),
        ];
    } else if ("locus" in specifier) {
        const scalar = toScalar(scaleResolution, specifier.locus);
        return [scalar, scalar];
    } else {
        throw new Error("Unsupported view attribute specifier.");
    }
}

/**
 * Builds a per-sample accessor for point or interval-based view attributes.
 *
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("../sampleViewTypes.js").ViewAttributeSpecifier} specifier
 * @returns {import("../types.js").AttributeInfo["accessor"]}
 */
export function createViewAttributeAccessor(view, specifier) {
    const xType = /** @type {any} */ (view.getEncoding()?.x)?.type;
    if (
        "aggregation" in specifier &&
        (!xType || !["quantitative", "index", "locus"].includes(xType))
    ) {
        throw new Error(
            "Interval aggregation requires an x encoding of type quantitative, index, or locus!"
        );
    }
    const scaleResolution = view.getScaleResolution("x");
    const root = view.getLayoutAncestors().at(-1);
    const collector = view.getCollector();
    const xAccessor = view.getDataAccessor("x");
    const hitTestMode = view.mark?.defaultHitTestMode ?? "intersects";
    const x2Accessor = view.getDataAccessor("x2");

    if (!collector || !xAccessor) {
        return () => undefined;
    }

    /** @type {[import("@genome-spy/core/spec/channel.js").Scalar, import("@genome-spy/core/spec/channel.js").Scalar] | undefined} */
    let cachedInterval;

    const getInterval = () => {
        if (!cachedInterval) {
            cachedInterval = normalizeInterval(
                scaleResolution,
                specifier,
                root
            );
        }
        return cachedInterval;
    };

    if (!("aggregation" in specifier)) {
        const datumAt = createDatumAtAccessor(view, collector);
        return (sampleId) => {
            const interval = getInterval();
            return datumAt(sampleId, interval[0])?.[specifier.field];
        };
    }

    const valueAccessor = (/** @type {any} */ datum) => datum[specifier.field];
    const featureMatches = specifier.featureFilter
        ? createFeatureFilterPredicate(specifier.featureFilter)
        : () => true;
    /** @type {[number, number] | undefined} */
    let numericBounds;
    const getNumericBounds = () => {
        if (!numericBounds) {
            const interval = getInterval();
            if (
                typeof interval[0] !== "number" ||
                typeof interval[1] !== "number"
            ) {
                throw new Error(
                    "Interval aggregation requires numeric coordinates!"
                );
            }
            numericBounds = /** @type {[number, number]} */ (
                interval[0] <= interval[1]
                    ? interval
                    : [interval[1], interval[0]]
            );
        }
        return numericBounds;
    };
    const op = specifier.aggregation.op;
    const needsWeights = op === "weightedMean" || op === "variance";
    const collectAggregationValue = (
        /** @type {any} */ datum,
        /** @type {number} */ weight,
        /** @type {number[]} */ values,
        /** @type {number[]} */ weights
    ) => {
        const value = valueAccessor(datum);
        if (value != null) {
            values.push(value);
            if (needsWeights) {
                weights.push(weight);
            }
        }
    };

    return (sampleId) => {
        const [start, end] = getNumericBounds();
        const data = collector.facetBatches.get(asArray(sampleId));
        if (!data?.length) {
            return op === "count" ? 0 : undefined;
        }

        /** @type {number[]} */
        const values = [];
        /** @type {number[]} */
        const weights = [];

        visitIntervalFeatures(
            data,
            xAccessor,
            x2Accessor,
            hitTestMode,
            start,
            end,
            (datum, weight) => {
                if (featureMatches(datum)) {
                    collectAggregationValue(datum, weight, values, weights);
                }
            }
        );

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
