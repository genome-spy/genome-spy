/**
 * @typedef {import("../types.js").AggregationOp} AggregationOp
 */

import { isIntervalSpecifier } from "../sampleViewTypes.js";

/**
 * @typedef {object} AggregationOpInfo
 * @property {AggregationOp} op
 * @property {string} label
 * @property {string} description
 * @property {boolean} preservesScaleDomain
 */

/** @type {AggregationOpInfo[]} */
export const aggregationOps = [
    {
        op: "count",
        label: "Item count",
        description: "Number of overlapping items (ignores field values)",
        preservesScaleDomain: false,
    },
    {
        op: "min",
        label: "Min",
        description: "Smallest value in the interval",
        preservesScaleDomain: true,
    },
    {
        op: "max",
        label: "Max",
        description: "Largest value in the interval",
        preservesScaleDomain: true,
    },
    {
        op: "weightedMean",
        label: "Weighted mean",
        description:
            "Mean weighted by clipped overlap length (or 1 for points)",
        preservesScaleDomain: true,
    },
    {
        op: "variance",
        label: "Variance",
        description: "Population variance weighted by clipped overlap length",
        preservesScaleDomain: false,
    },
];

const aggregationOpsById = new Map(
    aggregationOps.map((entry) => [entry.op, entry])
);

/**
 * @param {AggregationOp} op
 * @returns {AggregationOpInfo}
 */
export function getAggregationOpInfo(op) {
    const entry = aggregationOpsById.get(op);
    if (!entry) {
        throw new Error("Unknown aggregation op: " + op);
    }
    return entry;
}

/**
 * @param {AggregationOp} op
 * @returns {string}
 */
export function formatAggregationLabel(op) {
    return getAggregationOpInfo(op).label.toLowerCase();
}

/**
 * @param {AggregationOp} op
 * @returns {string}
 */
export function formatAggregationFunctionName(op) {
    return op === "count" ? "count" : formatAggregationLabel(op);
}

/**
 * @param {import("../sampleViewTypes.js").RecordFilter} filter
 * @returns {string}
 */
export function formatRecordFilterExpression(filter) {
    if (filter.operator === "in") {
        return (
            filter.field +
            " in [" +
            filter.values.map(formatRecordFilterValue).join(", ") +
            "]"
        );
    }

    return (
        filter.field +
        " " +
        formatRecordFilterOperator(filter.operator) +
        " " +
        formatRecordFilterValue(filter.value)
    );
}

/**
 * @param {import("../sampleViewTypes.js").RecordFilter["operator"]} operator
 * @returns {string}
 */
function formatRecordFilterOperator(operator) {
    switch (operator) {
        case "eq":
            return "=";
        case "lt":
            return "<";
        case "lte":
            return "<=";
        case "gt":
            return ">";
        case "gte":
            return ">=";
        case "in":
            return "in";
        default:
            throw new Error("Unknown record filter operator: " + operator);
    }
}

/**
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | null} value
 * @returns {string}
 */
export function formatRecordFilterValue(value) {
    return value === null ? "null" : String(value);
}

/**
 * @param {import("../types.js").AttributeIdentifier} attributeIdentifier
 * @returns {boolean}
 */
export function preservesScaleDomainForAttribute(attributeIdentifier) {
    const specifier = attributeIdentifier.specifier;
    if (!specifier || typeof specifier !== "object") {
        return true;
    }
    if (!isIntervalSpecifier(specifier)) {
        return true;
    }

    return getAggregationOpInfo(specifier.aggregation.op).preservesScaleDomain;
}

/**
 * @param {AggregationOp} op
 * @param {string} field
 * @param {import("../sampleViewTypes.js").RecordFilter} [recordFilter]
 * @returns {string}
 */
export function formatAggregationExpression(op, field, recordFilter) {
    const filterExpression = recordFilter
        ? " where " + formatRecordFilterExpression(recordFilter)
        : "";

    if (op === "count" && !recordFilter) {
        return formatAggregationLabel(op);
    }
    if (op === "count") {
        return (
            formatAggregationFunctionName(op) +
            "(" +
            filterExpression.trim() +
            ")"
        );
    }
    return formatAggregationLabel(op) + "(" + field + filterExpression + ")";
}
