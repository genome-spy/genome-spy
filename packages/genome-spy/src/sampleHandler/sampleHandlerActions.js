/**
 * @typedef {import("./sampleHandler").AttributeIdentifier} AttributeIdentifier
 */

// Redux-style actions
export const UNDO = "UNDO";
export const REDO = "REDO";
export const SORT_BY_NAME = "SORT_BY_NAME";
export const SORT_BY = "SORT_BY";
export const RETAIN_FIRST_OF_EACH = "RETAIN_FIRST_OF_EACH";
export const FILTER_BY_NOMINAL = "FILTER_BY_NOMINAL";
export const FILTER_BY_QUANTITATIVE = "FILTER_BY_QUANTITATIVE";
export const REMOVE_UNDEFINED = "REMOVE_UNDEFINED";
export const REMOVE_BY_ID = "REMOVE_BY_ID";
export const GROUP_BY_NOMINAL = "GROUP_BY_NOMINAL";
export const GROUP_TO_QUARTILES = "GROUP_TO_QUARTILES";

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
 * @param {AttributeIdentifier} attribute
 */
export function sortBy(attribute) {
    return { type: SORT_BY, attribute };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function retainFirstOfEach(attribute) {
    return { type: RETAIN_FIRST_OF_EACH, attribute };
}

/**
 *
 * @param {AttributeIdentifier} attribute
 * @param {"lt" | "lte" | "eq" | "gte" | "gt"} operator The comparison operator
 * @param {number} operand
 */

export function filterByQuantitative(attribute, operator, operand) {
    return {
        type: FILTER_BY_QUANTITATIVE,
        attribute,
        operator,
        operand
    };
}

/**
 * @param {AttributeIdentifier} attribute
 * @param {"retain" | "remove"} action
 * @param {any[]} values
 */
export function filterByNominal(attribute, action, values) {
    return {
        type: FILTER_BY_NOMINAL,
        attribute,
        action,
        values
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function removeUndefined(attribute) {
    return {
        type: REMOVE_UNDEFINED,
        attribute
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function groupByNominal(attribute) {
    return {
        type: GROUP_BY_NOMINAL,
        attribute
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function groupToQuartiles(attribute) {
    return {
        type: GROUP_TO_QUARTILES,
        attribute
    };
}
