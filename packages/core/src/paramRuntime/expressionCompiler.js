import createFunction from "../utils/expression.js";

/**
 * @param {string} expr
 * @param {Record<string, any>} [globalObject]
 * @returns {import("../utils/expression.js").ExpressionFunction}
 */
export function compileExpression(expr, globalObject = {}) {
    return createFunction(expr, globalObject);
}
