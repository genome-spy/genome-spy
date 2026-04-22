/**
 * @typedef {import("./selectionExpansionTypes.d.ts").SelectionExpansionMatcher} SelectionExpansionMatcher
 * @typedef {import("./selectionExpansionTypes.d.ts").SelectionExpansionPredicate} SelectionExpansionPredicate
 * @typedef {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate} ResolvedSelectionExpansionPredicate
 */

/**
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionPredicate | import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate} op
 * @returns {op is import("./selectionExpansionTypes.d.ts").LogicalOr | import("./selectionExpansionTypes.d.ts").ResolvedLogicalOr}
 */
export function isLogicalOr(op) {
    return "or" in op;
}

/**
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionPredicate | import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate} op
 * @returns {op is import("./selectionExpansionTypes.d.ts").LogicalAnd | import("./selectionExpansionTypes.d.ts").ResolvedLogicalAnd}
 */
export function isLogicalAnd(op) {
    return "and" in op;
}

/**
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionPredicate | import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate} op
 * @returns {op is import("./selectionExpansionTypes.d.ts").LogicalNot | import("./selectionExpansionTypes.d.ts").ResolvedLogicalNot}
 */
export function isLogicalNot(op) {
    return "not" in op;
}

/**
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionPredicate} op
 * @param {import("@genome-spy/core/data/flowNode.js").Datum} originDatum
 * @returns {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate}
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
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionMatcher} matcher
 * @param {import("@genome-spy/core/data/flowNode.js").Datum} originDatum
 * @returns {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate}
 */
export function normalizeSelectionExpansionMatcher(matcher, originDatum) {
    return normalizeSelectionExpansionPredicate(
        toSelectionExpansionPredicate(matcher),
        originDatum
    );
}

/**
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionMatcher} matcher
 * @returns {import("./selectionExpansionTypes.d.ts").SelectionExpansionPredicate}
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
 * @param {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate} predicate
 * @param {string[] | undefined} partitionBy
 * @param {import("@genome-spy/core/data/flowNode.js").Datum} originDatum
 * @returns {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate}
 */
export function withPartitionBy(predicate, partitionBy, originDatum) {
    if (!partitionBy?.length) {
        return predicate;
    }

    /** @type {Array<{ field: string; op: "eq"; value: import("./selectionExpansionTypes.d.ts").SelectionLeafValue }>} */
    const clauses = partitionBy.map((partitionField) => {
        const accessor = createSelectionExpansionFieldAccessor(partitionField);
        return {
            field: partitionField,
            op: "eq",
            value: /** @type {import("./selectionExpansionTypes.d.ts").SelectionLeafValue} */ (
                accessor(originDatum)
            ),
        };
    });

    return {
        and: [predicate, ...clauses],
    };
}

/**
 * @param {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionPredicate} predicate
 * @returns {(datum: import("@genome-spy/core/data/flowNode.js").Datum) => boolean}
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
 * Returns a field accessor for literal datum keys.
 *
 * Note: nested field expressions are intentionally not supported in selection
 * expansion for now.
 *
 * @param {string} fieldName
 * @returns {(datum: import("@genome-spy/core/data/flowNode.js").Datum) => unknown}
 */
export function createSelectionExpansionFieldAccessor(fieldName) {
    return (datum) => datum[fieldName];
}

/**
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionLeafPredicate} leaf
 * @param {import("@genome-spy/core/data/flowNode.js").Datum} originDatum
 * @returns {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionLeafPredicate}
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
                value: leaf.value,
            };
        }

        if (!("valueFromField" in leaf)) {
            throw new Error(
                "Selection expansion eq predicate is missing valueFromField."
            );
        }

        const accessor = createSelectionExpansionFieldAccessor(
            leaf.valueFromField
        );
        return {
            field: leaf.field,
            op: "eq",
            value: /** @type {import("./selectionExpansionTypes.d.ts").SelectionLeafValue} */ (
                accessor(originDatum)
            ),
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
 * @param {import("./selectionExpansionTypes.d.ts").ResolvedSelectionExpansionLeafPredicate} leaf
 * @returns {(datum: import("@genome-spy/core/data/flowNode.js").Datum) => boolean}
 */
function createLeafPredicateFunction(leaf) {
    const accessor = createSelectionExpansionFieldAccessor(leaf.field);

    if (leaf.op === "eq") {
        const value = leaf.value;
        return (datum) => accessor(datum) === value;
    }

    if (leaf.op === "in") {
        const allowedValues = new Set(leaf.values);
        return (datum) =>
            allowedValues.has(
                /** @type {import("./selectionExpansionTypes.d.ts").SelectionLeafValue} */ (
                    accessor(datum)
                )
            );
    }

    throw new Error(
        "Unknown resolved selection expansion predicate operator: " +
            JSON.stringify(leaf)
    );
}

/**
 * @param {import("./selectionExpansionTypes.d.ts").SelectionExpansionMatcher} matcher
 * @returns {matcher is import("./selectionExpansionTypes.d.ts").SelectionExpansionRule}
 */
function isSelectionExpansionRule(matcher) {
    return "kind" in matcher;
}
