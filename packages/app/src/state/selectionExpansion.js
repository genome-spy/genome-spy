import { field } from "@genome-spy/core/utils/field.js";

/**
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("@genome-spy/core/data/flowNode.js").Datum} Datum
 *
 * @typedef {Scalar | null} SelectionLeafValue
 *
 * @typedef {{ field: string, op: "eq", value: SelectionLeafValue } | { field: string, op: "eq", valueFromField: string } | { field: string, op: "in", values: SelectionLeafValue[] }} SelectionExpansionLeafPredicate
 *
 * @typedef {{ and: SelectionExpansionPredicate[] }} LogicalAnd
 * @typedef {{ or: SelectionExpansionPredicate[] }} LogicalOr
 * @typedef {{ not: SelectionExpansionPredicate }} LogicalNot
 * @typedef {SelectionExpansionLeafPredicate | LogicalAnd | LogicalOr | LogicalNot} SelectionExpansionPredicate
 * @typedef {{ kind: "sameFieldValue", field: string }} SelectionExpansionRule
 * @typedef {SelectionExpansionPredicate | SelectionExpansionRule} SelectionExpansionMatcher
 *
 * @typedef {{ field: string, op: "eq", value: SelectionLeafValue } | { field: string, op: "in", values: SelectionLeafValue[] }} ResolvedSelectionExpansionLeafPredicate
 * @typedef {{ and: ResolvedSelectionExpansionPredicate[] }} ResolvedLogicalAnd
 * @typedef {{ or: ResolvedSelectionExpansionPredicate[] }} ResolvedLogicalOr
 * @typedef {{ not: ResolvedSelectionExpansionPredicate }} ResolvedLogicalNot
 * @typedef {ResolvedSelectionExpansionLeafPredicate | ResolvedLogicalAnd | ResolvedLogicalOr | ResolvedLogicalNot} ResolvedSelectionExpansionPredicate
 */

/**
 * @param {SelectionExpansionPredicate | ResolvedSelectionExpansionPredicate} op
 * @returns {op is LogicalOr | ResolvedLogicalOr}
 */
export function isLogicalOr(op) {
    return "or" in op;
}

/**
 * @param {SelectionExpansionPredicate | ResolvedSelectionExpansionPredicate} op
 * @returns {op is LogicalAnd | ResolvedLogicalAnd}
 */
export function isLogicalAnd(op) {
    return "and" in op;
}

/**
 * @param {SelectionExpansionPredicate | ResolvedSelectionExpansionPredicate} op
 * @returns {op is LogicalNot | ResolvedLogicalNot}
 */
export function isLogicalNot(op) {
    return "not" in op;
}

/**
 * @param {SelectionExpansionPredicate} op
 * @param {Datum} originDatum
 * @returns {ResolvedSelectionExpansionPredicate}
 */
export function normalizeSelectionExpansionPredicate(op, originDatum) {
    if (isLogicalNot(op)) {
        return {
            not: normalizeSelectionExpansionPredicate(op.not, originDatum),
        };
    }

    if (isLogicalAnd(op)) {
        return {
            and: op.and.map((part) =>
                normalizeSelectionExpansionPredicate(part, originDatum)
            ),
        };
    }

    if (isLogicalOr(op)) {
        return {
            or: op.or.map((part) =>
                normalizeSelectionExpansionPredicate(part, originDatum)
            ),
        };
    }

    return resolveLeafPredicate(op, originDatum);
}

/**
 * Converts matcher shorthand into a predicate, then resolves origin-dependent
 * references such as `valueFromField`.
 *
 * @param {SelectionExpansionMatcher} matcher
 * @param {Datum} originDatum
 * @returns {ResolvedSelectionExpansionPredicate}
 */
export function normalizeSelectionExpansionMatcher(matcher, originDatum) {
    return normalizeSelectionExpansionPredicate(
        toSelectionExpansionPredicate(matcher),
        originDatum
    );
}

/**
 * @param {SelectionExpansionMatcher} matcher
 * @returns {SelectionExpansionPredicate}
 */
export function toSelectionExpansionPredicate(matcher) {
    if (isSelectionExpansionRule(matcher)) {
        if (matcher.kind === "sameFieldValue") {
            return {
                field: matcher.field,
                op: "eq",
                valueFromField: matcher.field,
            };
        } else {
            throw new Error(
                "Unknown selection expansion rule: " + JSON.stringify(matcher)
            );
        }
    }

    return matcher;
}

/**
 * Adds partition constraints to a predicate.
 *
 * @param {ResolvedSelectionExpansionPredicate} predicate
 * @param {string[] | undefined} partitionBy
 * @param {Datum} originDatum
 * @returns {ResolvedSelectionExpansionPredicate}
 */
export function withPartitionBy(predicate, partitionBy, originDatum) {
    if (!partitionBy?.length) {
        return predicate;
    }

    /** @type {{ field: string, op: "eq", value: SelectionLeafValue }[]} */
    const clauses = partitionBy.map((partitionField) => {
        const accessor = field(partitionField);
        return {
            field: partitionField,
            op: "eq",
            value: /** @type {SelectionLeafValue} */ (accessor(originDatum)),
        };
    });

    return {
        and: [predicate, ...clauses],
    };
}

/**
 * @param {ResolvedSelectionExpansionPredicate} predicate
 * @returns {(datum: Datum) => boolean}
 */
export function createSelectionExpansionPredicateFunction(predicate) {
    if (isLogicalNot(predicate)) {
        const sub = createSelectionExpansionPredicateFunction(predicate.not);
        return (datum) => !sub(datum);
    }

    if (isLogicalAnd(predicate)) {
        const subPredicates = predicate.and.map(
            createSelectionExpansionPredicateFunction
        );
        return (datum) => subPredicates.every((sub) => sub(datum));
    }

    if (isLogicalOr(predicate)) {
        const subPredicates = predicate.or.map(
            createSelectionExpansionPredicateFunction
        );
        return (datum) => subPredicates.some((sub) => sub(datum));
    }

    return createLeafPredicateFunction(predicate);
}

/**
 * @param {SelectionExpansionLeafPredicate} leaf
 * @param {Datum} originDatum
 * @returns {ResolvedSelectionExpansionLeafPredicate}
 */
function resolveLeafPredicate(leaf, originDatum) {
    if (leaf.op === "eq") {
        const hasValue = "value" in leaf;
        const hasValueFromField = "valueFromField" in leaf;

        if (hasValue === hasValueFromField) {
            throw new Error(
                "Selection expansion eq predicate must have exactly one of 'value' or 'valueFromField'."
            );
        }

        if (hasValue) {
            return {
                field: leaf.field,
                op: "eq",
                value: /** @type {SelectionLeafValue} */ (leaf.value),
            };
        }

        if (!("valueFromField" in leaf)) {
            throw new Error(
                "Selection expansion eq predicate is missing valueFromField."
            );
        }

        const accessor = field(leaf.valueFromField);
        return {
            field: leaf.field,
            op: "eq",
            value: /** @type {SelectionLeafValue} */ (accessor(originDatum)),
        };
    }

    if (leaf.op === "in") {
        if (!Array.isArray(leaf.values)) {
            throw new Error(
                "Selection expansion in predicate requires an array of values."
            );
        }

        return {
            field: leaf.field,
            op: "in",
            values: [...leaf.values],
        };
    }

    throw new Error(
        "Unknown selection expansion predicate operator: " +
            JSON.stringify(leaf)
    );
}

/**
 * @param {ResolvedSelectionExpansionLeafPredicate} leaf
 * @returns {(datum: Datum) => boolean}
 */
function createLeafPredicateFunction(leaf) {
    const accessor = field(leaf.field);

    if (leaf.op === "eq") {
        const value = leaf.value;
        return (datum) => accessor(datum) === value;
    }

    if (leaf.op === "in") {
        const allowedValues = new Set(leaf.values);
        return (datum) =>
            allowedValues.has(
                /** @type {SelectionLeafValue} */ (accessor(datum))
            );
    }

    throw new Error(
        "Unknown resolved selection expansion predicate operator: " +
            JSON.stringify(leaf)
    );
}

/**
 * @param {SelectionExpansionMatcher} matcher
 * @returns {matcher is SelectionExpansionRule}
 */
function isSelectionExpansionRule(matcher) {
    return "kind" in matcher;
}
