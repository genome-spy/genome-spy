import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";
import { resolveIntervalReference } from "./intervalReferenceResolver.js";
import { visitIntervalFeatures } from "./attributeAggregation/intervalFeatureTraversal.js";

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

    /** @type {unknown[]} */
    const values = [];
    for (const data of collector.facetBatches.values()) {
        visitIntervalFeatures(
            data,
            xAccessor,
            x2Accessor,
            hitTestMode,
            start,
            end,
            (datum) => {
                values.push(datum[field]);
            }
        );
    }

    return values;
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
