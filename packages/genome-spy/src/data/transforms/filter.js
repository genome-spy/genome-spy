
import createFunction from '../../utils/expression';

/**
 * @typedef {import("../../spec/transform").FilterConfig} FilterConfig
 */

/**
 * 
 * @param {FilterConfig} filterConfig 
 * @param {Object[]} rows 
 */
export default function filterTransform(filterConfig, rows) {
    return rows.filter(createFunction(filterConfig.expr));
}