/**
 * @typedef {import("../../sampleView/state/payloadTypes.js").ComparisonOperatorType} ComparisonOperatorType
 */

/**
 * @type {Record<ComparisonOperatorType, (a: any, b: any) => boolean>}
 */
export const COMPARISON_OPERATORS = {
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    eq: (a, b) => a == b,
    gte: (a, b) => a >= b,
    gt: (a, b) => a > b,
};

/**
 * @param {ComparisonOperatorType} operator
 * @param {unknown} value
 * @returns {(input: unknown) => boolean}
 */
export function createComparisonPredicate(operator, value) {
    const compare = COMPARISON_OPERATORS[operator];
    return (input) => compare(input, value);
}
