import { range } from "d3-array";
import mapSort from "mapsort";
import { isNumber } from "vega-util";

/**
 * Wraps an accessor for comparison. Handles data with missing values
 * and provides the correct order for ordinal data.
 *
 * @param {function(string):any} accessor
 * @param {import("./types").AttributeInfo} attributeInfo
 * @returns {function(string):any}
 */
export function wrapAccessorForComparison(accessor, attributeInfo) {
    /** @type {function(any):any} scale */
    const createOrdinalLookup = (scale) =>
        scale.copy().range(range(0, scale.domain().length)).unknown(-1);

    /** @type {function(any):any} */
    let wrapper;
    switch (attributeInfo.type) {
        case "quantitative":
            wrapper = (x) => (isNumber(x) && !isNaN(x) ? -x : -Infinity);
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
 * @typedef {"lt" | "lte" | "eq" | "gte" | "gt"} ComparisonOperatorType
 */

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
 * TODO: Ordinal attributes
 *
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {boolean} [descending]
 * @returns {T[]}
 * @template T
 */
export function sort(samples, accessor, descending = false) {
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
 * @type {Record<ComparisonOperatorType, (a: T, b: T) => boolean>}
 * @template T
 */
const COMPARISON_OPERATORS = {
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    eq: (a, b) => a == b,
    gte: (a, b) => a >= b,
    gt: (a, b) => a > b,
};

/**
 * @param {T[]} samples
 * @param {function(T):any} accessor
 * @param {ComparisonOperatorType} operator The comparison operator
 * @param {any} operand
 * @returns {T[]}
 * @template T
 *
 */
export function filterQuantitative(samples, accessor, operator, operand) {
    const op = COMPARISON_OPERATORS[operator];
    return samples.filter((sample) => op(accessor(sample), operand));
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
