import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";
import { resolveIntervalReference } from "./intervalReferenceResolver.js";

/**
 * Collects raw feature field values inside a selection interval before
 * per-sample aggregation.
 *
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("./sampleViewTypes.js").SelectionIntervalSource["selector"]} selectionSelector
 * @param {string} field
 * @returns {unknown[] | undefined}
 */
export function collectSelectionFeatureFieldValues(
    view,
    selectionSelector,
    field
) {
    return collectIntervalFeatureFieldValues(
        view,
        {
            type: "selection",
            selector: selectionSelector,
        },
        field
    );
}

/**
 * Collects raw feature field values inside an interval before per-sample
 * aggregation.
 *
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("./sampleViewTypes.js").IntervalReference} intervalReference
 * @param {string} field
 * @returns {unknown[] | undefined}
 */
export function collectIntervalFeatureFieldValues(
    view,
    intervalReference,
    field
) {
    const collector = view.getCollector();
    const xAccessor = view.getDataAccessor("x");
    if (!collector || !xAccessor) {
        return;
    }

    const interval = resolveIntervalReference(
        view.getLayoutAncestors().at(-1),
        intervalReference
    );
    const [start, end] = normalizeInterval(view, interval);
    const x2Accessor = view.getDataAccessor("x2");
    const hitTestMode = view.mark?.defaultHitTestMode ?? "intersects";
    const isPointFeature =
        !x2Accessor || (xAccessor && xAccessor.equals(x2Accessor));

    /** @type {unknown[]} */
    const values = [];
    for (const data of collector.facetBatches.values()) {
        for (const datum of data) {
            const x = /** @type {number} */ (xAccessor(datum));
            if (isPointFeature) {
                if (x >= start && x <= end) {
                    values.push(datum[field]);
                }
            } else {
                const x2 = /** @type {number} */ (x2Accessor(datum));
                if (featureOverlapsInterval(x, x2, start, end, hitTestMode)) {
                    values.push(datum[field]);
                }
            }
        }
    }

    return values;
}

/**
 * @param {number} x
 * @param {number} x2
 * @param {number} start
 * @param {number} end
 * @param {string} hitTestMode
 * @returns {boolean}
 */
function featureOverlapsInterval(x, x2, start, end, hitTestMode) {
    if (hitTestMode === "endpoints") {
        return (x >= start && x <= end) || (x2 >= start && x2 <= end);
    } else if (hitTestMode === "encloses") {
        return x >= start && x2 <= end;
    } else {
        return Math.min(x2, end) > Math.max(x, start);
    }
}

/**
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("./types.js").Interval} interval
 * @returns {[number, number]}
 */
function normalizeInterval(view, interval) {
    const scalarInterval = asArray(interval).map((value) =>
        toScalar(view, value)
    );
    if (
        typeof scalarInterval[0] !== "number" ||
        typeof scalarInterval[1] !== "number"
    ) {
        throw new Error(
            "Selection feature summaries require numeric intervals."
        );
    }

    return scalarInterval[0] <= scalarInterval[1]
        ? [scalarInterval[0], scalarInterval[1]]
        : [scalarInterval[1], scalarInterval[0]];
}

/**
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | import("@genome-spy/core/spec/genome.js").ChromosomalLocus} value
 * @returns {import("@genome-spy/core/spec/channel.js").Scalar}
 */
function toScalar(view, value) {
    if (!isChromosomalLocus(value)) {
        return value;
    }

    const scale = view.getScaleResolution("x").getScale();
    const genome = "genome" in scale ? scale.genome() : undefined;
    if (!genome) {
        throw new Error(
            "Encountered a chromosomal locus but no genome is available."
        );
    }

    return genome.toContinuous(value.chrom, value.pos);
}
