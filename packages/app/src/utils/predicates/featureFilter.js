import { createComparisonPredicate } from "./comparison.js";

/**
 * @typedef {import("../../sampleView/sampleViewTypes.js").FeatureFilter} FeatureFilter
 */

/**
 * Creates a predicate for matching raw view features before per-sample interval
 * aggregation.
 *
 * @param {FeatureFilter} filter
 * @returns {(datum: Record<string, unknown>) => boolean}
 */
export function createFeatureFilterPredicate(filter) {
    const field = filter.field;

    if (filter.operator === "eq") {
        return (datum) => datum[field] === filter.value;
    } else if (filter.operator === "in") {
        /** @type {Set<unknown>} */
        const values = new Set(filter.values);
        return (datum) => values.has(datum[field]);
    } else {
        const predicate = createComparisonPredicate(
            filter.operator,
            filter.value
        );
        return (datum) => predicate(datum[field]);
    }
}
