import { createComparisonPredicate } from "./comparison.js";

/**
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 */
/**
 * @typedef {{
 *     field: string;
 *     operator: "eq";
 *     value: Scalar | null;
 * } | {
 *     field: string;
 *     operator: "in";
 *     values: (Scalar | null)[];
 * } | {
 *     field: string;
 *     operator: "lt" | "lte" | "gt" | "gte";
 *     value: number;
 * }} RecordFilter
 */

/**
 * Creates a predicate for matching raw view records before per-sample interval
 * aggregation.
 *
 * @param {RecordFilter} filter
 * @returns {(datum: Record<string, unknown>) => boolean}
 */
export function createRecordFilterPredicate(filter) {
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
