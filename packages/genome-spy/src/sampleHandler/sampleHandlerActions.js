// Redux-style actions
export const UNDO = "UNDO";
export const REDO = "REDO";
export const SORT_BY_NAME = "SORT_BY_NAME";
export const SORT_BY_ATTRIBUTE = "SORT_BY_ATTRIBUTE";
export const SORT_BY_LOCUS = "SORT_BY_LOCUS";
export const RETAIN_FIRST_OF_EACH = "RETAIN_FIRST_OF_EACH";
export const FILTER_BY_NOMINAL_ATTRIBUTE = "REMOVE_BY_NOMINAL_ATTRIBUTE";
export const FILTER_BY_QUANTITATIVE_ATTRIBUTE =
    "REMOVE_BY_QUANTITATIVE_ATTRIBUTE";
export const FILTER_BY_UNDEFINED_ATTRIBUTE = "FILTER_BY_UNDEFINED_ATTRIBUTE";
export const FILTER_BY_LOCUS = "REMOVE_BY_LOCUS";
export const REMOVE_SAMPLE = "REMOVE_SAMPLE";
export const GROUP_BY_NOMINAL_ATTRIBUTE = "GROUP_BY_NOMINAL_ATTRIBUTE";

export function undo() {
    return { type: UNDO };
}

export function redo() {
    return { type: REDO };
}

export function sortByName() {
    return { type: SORT_BY_NAME };
}

/**
 * @param {string} attribute
 */
export function sortByAttribute(attribute) {
    return { type: SORT_BY_ATTRIBUTE, attribute };
}

/**
 * @param {string} attribute
 */
export function retainFirstOfEach(attribute) {
    return { type: RETAIN_FIRST_OF_EACH, attribute };
}

/**
 *
 * @param {string} attribute
 * @param {"lt" | "lte" | "eq" | "gte" | "gt"} operator The comparison operator
 * @param {number} operand
 */

export function filterByQuantitativeAttribute(attribute, operator, operand) {
    return {
        type: FILTER_BY_QUANTITATIVE_ATTRIBUTE,
        attribute,
        operator,
        operand
    };
}

/**
 * @param {string} attribute
 * @param {"retain" | "remove"} action
 * @param {any[]} values
 */
export function filterByNominalAttribute(attribute, action, values) {
    return {
        type: FILTER_BY_NOMINAL_ATTRIBUTE,
        attribute,
        action,
        values
    };
}

/**
 * @param {string} attribute
 */
export function filterByUndefinedAttribute(attribute) {
    return {
        type: FILTER_BY_UNDEFINED_ATTRIBUTE,
        attribute
    };
}

/**
 * @param {string} attribute
 */
export function groupByNominalAttribute(attribute) {
    return {
        type: GROUP_BY_NOMINAL_ATTRIBUTE,
        attribute
    };
}
