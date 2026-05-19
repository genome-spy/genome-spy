import { range } from "d3-array";
import mapSort from "mapsort";
import { isNumber } from "vega-util";
import { createComparisonPredicate } from "../../utils/predicates/comparison.js";

/**
 * Wraps an accessor for comparison. Handles data with missing values
 * and provides the correct order for ordinal data.
 *
 * @param {function(string):any} accessor
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @returns {function(string):any}
 */
export function wrapAccessorForComparison(accessor, attributeInfo) {
    /** @type {function(any):any} scale */
    const createOrdinalLookup = (scale) =>
        scale.copy().range(range(0, scale.domain().length)).unknown(-1);

    /** @type {function(any):any} */
    let wrapper = (x) => (x === undefined || x === null ? "" : x);
    switch (attributeInfo.type) {
        case "quantitative":
            wrapper = (x) => (isNumber(x) && !isNaN(x) ? x : -Infinity);
            break;
        case "ordinal":
            // Use the (specified) domain for ordering
            wrapper = createOrdinalLookup(attributeInfo.scale);
            break;
        case "nominal":
            wrapper = (x) => x || "";
            break;
        default:
    }

    return (sampleId) => wrapper(accessor(sampleId));
}

/**
 *
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @returns {T[]}
 * @template T
 */
export function retainFirstOfEachCategory(samples, accessor) {
    const included = new Set();

    /** @param {any} key */
    const checkAndAdd = (key) => {
        const has = included.has(key);
        included.add(key);
        return has;
    };

    return samples.filter((sample) => !checkAndAdd(accessor(sample)));
}

/**
 *
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {number} n How many categories to retain
 * @returns {T[]}
 * @template T
 */
export function retainFirstNCategories(samples, accessor, n) {
    const included = new Set();

    /** @param {any} key */
    const checkAndAdd = (key) => {
        if (included.size < n) {
            included.add(key);
        }
        return included.has(key);
    };

    return samples.filter((sample) => checkAndAdd(accessor(sample)));
}

/**
 * Retains all samples in categories where at least one sample satisfies the
 * condition.
 *
 * @param {T[]} samples
 * @param {function(T):any} categoryAccessor
 * @param {function(T):any} conditionAccessor
 * @param {import("./payloadTypes.js").AttributeCondition} condition
 * @returns {T[]}
 * @template T
 */
export function retainCategoriesByCondition(
    samples,
    categoryAccessor,
    conditionAccessor,
    condition
) {
    const retainedCategories = getCategoriesWithMatchingSamples(
        samples,
        categoryAccessor,
        conditionAccessor,
        condition
    );

    return samples.filter((sample) =>
        retainedCategories.has(categoryAccessor(sample))
    );
}

/**
 * @param {Iterable<T>} samples
 * @param {function(T):any} categoryAccessor
 * @param {function(T):any} conditionAccessor
 * @param {import("./payloadTypes.js").AttributeCondition} condition
 * @returns {Set<any>}
 * @template T
 */
export function getCategoriesWithMatchingSamples(
    samples,
    categoryAccessor,
    conditionAccessor,
    condition
) {
    if (condition.operator === "in" && condition.required === "all") {
        return getCategoriesWithAllConditionValues(
            samples,
            categoryAccessor,
            conditionAccessor,
            condition.values
        );
    }

    const predicate = createConditionPredicate(condition);
    const retainedCategories = new Set();

    for (const sample of samples) {
        if (predicate(conditionAccessor(sample))) {
            retainedCategories.add(categoryAccessor(sample));
        }
    }

    return retainedCategories;
}

/**
 * @param {Iterable<T>} samples
 * @param {function(T):any} categoryAccessor
 * @param {function(T):any} conditionAccessor
 * @param {any[]} values
 * @returns {Set<any>}
 * @template T
 */
function getCategoriesWithAllConditionValues(
    samples,
    categoryAccessor,
    conditionAccessor,
    values
) {
    if (values.length === 0) {
        return new Set();
    }

    const requiredValues = new Set(values);
    /** @type {Map<any, Set<any>>} */
    const categoryToValues = new Map();

    for (const sample of samples) {
        const conditionValue = conditionAccessor(sample);
        if (!requiredValues.has(conditionValue)) {
            continue;
        }

        const category = categoryAccessor(sample);
        let foundValues = categoryToValues.get(category);
        if (!foundValues) {
            foundValues = new Set();
            categoryToValues.set(category, foundValues);
        }
        foundValues.add(conditionValue);
    }

    const retainedCategories = new Set();
    for (const [category, foundValues] of categoryToValues) {
        if (values.every((value) => foundValues.has(value))) {
            retainedCategories.add(category);
        }
    }

    return retainedCategories;
}

/**
 * @param {import("./payloadTypes.js").AttributeCondition} condition
 * @returns {function(any):boolean}
 */
function createConditionPredicate(condition) {
    if (condition.operator === "in") {
        const values = new Set(condition.values);
        return (value) => values.has(value);
    } else {
        return createComparisonPredicate(condition.operator, condition.operand);
    }
}

/**
 * TODO: Ordinal attributes
 *
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {boolean} [descending]
 * @returns {T[]}
 * @template T
 */
export function sort(samples, accessor, descending = false) {
    // @ts-ignore TODO: Fix mapsort typings
    return mapSort(samples, accessor, (av, bv) => {
        if (descending) {
            [av, bv] = [bv, av];
        }

        if (av < bv) {
            return -1;
        } else if (av > bv) {
            return 1;
        } else {
            return 0;
        }
    });
}

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {import("./payloadTypes.js").ComparisonOperatorType} operator The comparison operator
 * @param {any} operand
 * @returns {T[]}
 * @template T
 *
 */
export function filterQuantitative(samples, accessor, operator, operand) {
    const predicate = createComparisonPredicate(operator, operand);
    return samples.filter((sample) => predicate(accessor(sample)));
}

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {"retain" | "remove"} action
 * @param {any[]} values
 * @returns {T[]}
 * @template T
 */
export function filterNominal(samples, accessor, action, values) {
    const valueSet = new Set(values);

    /** @type {function(any):boolean} */
    const predicate = (x) => valueSet.has(x);

    /** @type {function(boolean):boolean} */
    const maybeNegatedPredicate =
        action == "remove" ? (x) => !predicate(x) : predicate;

    return samples.filter((sample) => maybeNegatedPredicate(accessor(sample)));
}

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @returns {T[]}
 * @template T
 */
export function filterUndefined(samples, accessor) {
    /** @type {function(any):boolean} */
    const isValid = (x) => x !== undefined && x !== null;
    return samples.filter((sample) => isValid(accessor(sample)));
}

/**
 * Returns values that are present in all non-empty sample groups.
 *
 * @param {Iterable<Iterable<T>>} groups
 * @param {function(T):any} accessor
 * @returns {any[]}
 * @template T
 */
export function getMatchedValues(groups, accessor) {
    /** @type {Set<any>[]} */
    const valueSets = [];

    for (const group of groups) {
        /** @type {Set<any>} */
        const values = new Set();
        for (const sample of group) {
            values.add(accessor(sample));
        }
        if (values.size > 0) {
            valueSets.push(values);
        }
    }

    if (!valueSets.length) {
        return [];
    }

    /** @type {any[]} */
    const intersectedValues = [];

    for (const value of valueSets[0]) {
        let found = true;
        for (let i = 1; i < valueSets.length && found; i++) {
            found = valueSets[i].has(value);
        }

        if (found) {
            intersectedValues.push(value);
        }
    }

    return intersectedValues;
}
