import { resolveIntervalReference } from "./intervalReferenceResolver.js";
import {
    normalizeNumericInterval,
    visitIntervalFeatures,
} from "./attributeAggregation/intervalFeatureTraversal.js";

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
    const [start, end] = normalizeNumericInterval(
        view.getScaleResolution("x"),
        interval,
        "Selection feature summaries require numeric intervals."
    );
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
