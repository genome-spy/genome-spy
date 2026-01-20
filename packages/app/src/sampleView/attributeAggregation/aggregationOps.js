/**
 * @typedef {import("../types.js").AggregationOp} AggregationOp
 */

/** @typedef {{ op: AggregationOp, label: string, description: string }} AggregationOpInfo */

/** @type {AggregationOpInfo[]} */
export const aggregationOps = [
    {
        op: "count",
        label: "Item count",
        description: "Number of overlapping items (ignores field values)",
    },
    { op: "min", label: "Min", description: "Smallest value in the interval" },
    { op: "max", label: "Max", description: "Largest value in the interval" },
    {
        op: "weightedMean",
        label: "Weighted mean",
        description:
            "Mean weighted by clipped overlap length (or 1 for points)",
    },
    {
        op: "variance",
        label: "Variance",
        description: "Population variance weighted by clipped overlap length",
    },
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
    if (op === "count") {
        return formatAggregationLabel(op);
    }
    return formatAggregationLabel(op) + "(" + field + ")";
}
