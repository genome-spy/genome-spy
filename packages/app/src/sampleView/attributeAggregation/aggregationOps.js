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
        op: "itemCount",
        label: "Item count",
        description: "Number of features in the interval",
        preservesScaleDomain: false,
    },
    {
        op: "count",
        label: "Count",
        description: "Number of non-missing values in the interval",
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
 * @param {import("../sampleViewTypes.js").FeatureFilter} filter
 * @returns {string}
 */
export function formatFeatureFilterExpression(filter) {
    if (filter.operator === "in") {
        return (
            filter.field +
            " in {" +
            filter.values.map(formatFeatureFilterValue).join(", ") +
            "}"
        );
    }

    return (
        filter.field +
        " " +
        formatFeatureFilterOperator(filter.operator) +
        " " +
        formatFeatureFilterValue(filter.value)
    );
}

/**
 * @param {import("../sampleViewTypes.js").FeatureFilter["operator"]} operator
 * @returns {string}
 */
export function formatFeatureFilterOperator(operator) {
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
            throw new Error("Unknown feature filter operator: " + operator);
    }
}

/**
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | null} value
 * @returns {string}
 */
export function formatFeatureFilterValue(value) {
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
 * @param {import("../sampleViewTypes.js").FeatureFilter} [featureFilter]
 * @returns {string}
 */
export function formatAggregationExpression(op, field, featureFilter) {
    const filterExpression = featureFilter
        ? " where " + formatFeatureFilterExpression(featureFilter)
        : "";

    if (op === "itemCount") {
        return (
            formatAggregationFunctionName(op) +
            (featureFilter ? "(" + filterExpression.trim() + ")" : "")
        );
    }

    if (op === "count") {
        return (
            formatAggregationFunctionName(op) +
            "(" +
            field +
            filterExpression +
            ")"
        );
    }
    return formatAggregationLabel(op) + "(" + field + filterExpression + ")";
}
