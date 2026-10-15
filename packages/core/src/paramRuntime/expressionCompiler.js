import createFunction from "../utils/expression.js";

/**
 * @param {string} expr
 * @param {Record<string, any>} [globalObject]
 * @param {object} [context]
 * @returns {import("../utils/expression.js").CompiledExpressionFunction}
 */
export function compileExpression(expr, globalObject = {}, context = {}) {
    return createFunction(expr, globalObject, context);
}
