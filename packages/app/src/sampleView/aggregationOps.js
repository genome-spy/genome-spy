/**
 * @typedef {import("./types.js").AggregationOp} AggregationOp
 */

/** @type {{ op: AggregationOp, label: string }[]} */
export const aggregationOps = [
    { op: "count", label: "Count" },
    { op: "min", label: "Min" },
    { op: "max", label: "Max" },
    { op: "weightedMean", label: "Weighted mean" },
    { op: "variance", label: "Variance" },
];

const aggregationOpsById = new Map(
    aggregationOps.map((entry) => [entry.op, entry])
);

/**
 * @param {AggregationOp} op
 * @returns {string}
 */
export function formatAggregationLabel(op) {
    const entry = aggregationOpsById.get(op);
    if (!entry) {
        throw new Error("Unknown aggregation op: " + op);
    }
    return entry.label.toLowerCase();
}

/**
 * @param {AggregationOp} op
 * @param {string} field
 * @returns {string}
 */
export function formatAggregationExpression(op, field) {
    return formatAggregationLabel(op) + "(" + field + ")";
}
