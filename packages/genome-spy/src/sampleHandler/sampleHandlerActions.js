/**
 * @typedef {import("./sampleHandler").AttributeIdentifier} AttributeIdentifier
 */

// Redux-style actions
export const UNDO = "undo";
export const REDO = "redo";
export const SORT_BY_NAME = "sortByName";
export const SORT_BY = "sortBy";
export const RETAIN_FIRST_OF_EACH = "retainFirstOfEach";
export const FILTER_BY_NOMINAL = "filterByNominal";
export const FILTER_BY_QUANTITATIVE = "filterByQuantitative";
export const REMOVE_UNDEFINED = "removeUndefined";
export const REMOVE_BY_ID = "removeById";
export const GROUP_BY_NOMINAL = "groupByNominal";
export const GROUP_TO_QUARTILES = "groupToQuartiles";

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
    return { type: SORT_BY, payload: { attribute } };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function retainFirstOfEach(attribute) {
    return { type: RETAIN_FIRST_OF_EACH, payload: { attribute } };
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
        payload: {
            attribute,
            operator,
            operand
        }
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
        payload: {
            attribute,
            action,
            values
        }
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function removeUndefined(attribute) {
    return {
        type: REMOVE_UNDEFINED,
        payload: { attribute }
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function groupByNominal(attribute) {
    return {
        type: GROUP_BY_NOMINAL,
        payload: { attribute }
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function groupToQuartiles(attribute) {
    return {
        type: GROUP_TO_QUARTILES,
        payload: { attribute }
    };
}
