/**
 * @typedef {import("./types.js").AggregationOp} AggregationOp
 */

/** @type {{ op: AggregationOp, label: string }[]} */
export const aggregationOps = [
    { op: "count", label: "Count" },
    { op: "min", label: "Min" },
    { op: "max", label: "Max" },
    { op: "weightedMean", label: "Weighted mean" },
];

/**
 * @param {AggregationOp} op
 * @returns {string}
 */
export function formatAggregationLabel(op) {
    switch (op) {
        case "min":
        case "max":
        case "count":
            return op;
        case "weightedMean":
            return "weighted mean";
        default:
            throw new Error("Unknown aggregation op: " + op);
    }
}

/**
 * @param {AggregationOp} op
 * @param {string} field
 * @returns {string}
 */
export function formatAggregationExpression(op, field) {
    return formatAggregationLabel(op) + "(" + field + ")";
}
