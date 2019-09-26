
/**
 * @typedef {import("../../spec").SimpleFilterConfig} SimpleFilterConfig
 */

/**
 * @param {SimpleFilterConfig} simpleFilterConfig 
 * @param {Object[]} rows
 */
export default function simpleFilterTransform(simpleFilterConfig, rows) {
    return rows.filter(createFilter(simpleFilterConfig));
}

/**
 * 
 * @param {SimpleFilterConfig} filterConfig 
 */
export function createFilter(filterConfig) {
    const v = filterConfig.value;

    const accessor = x => x[filterConfig.field];

    // Assume that x is a string. Not very robust, but should be enough for now
    switch (filterConfig.operator) {
        case "eq": return x => accessor(x) == v;
        case "neq": return x => accessor(x) != v;
        case "lt": return x => accessor(x) < v;
        case "lte": return x => accessor(x) <= v;
        case "gte": return x => accessor(x) >= v;
        case "gt": return x => accessor(x) > v;
        default:
            throw new Error(`Unknown operator: ${filterConfig.operator}`);
    }
}