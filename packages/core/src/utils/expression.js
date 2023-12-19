import { parseExpression, codegenExpression } from "vega-expression";

/**
 * @typedef { object } ExpressionProps
 * @prop { string[] } fields
 * @prop { string[] } globals
 * @prop { string } code
 *
 * @typedef { ((x: object) => any) & ExpressionProps } ExpressionFunction
 *
 * @param {string} expr
 */
export default function createFunction(expr, globalObject = {}) {
    const cg = codegenExpression({
        forbidden: [],
        allowed: ["datum"],
        globalvar: "globalObject",
        fieldvar: "datum",
    });

    try {
        const parsed = parseExpression(expr);
        const generatedCode = cg(parsed);

        // eslint-disable-next-line no-new-func
        const fn = Function(
            "datum",
            "globalObject",
            `"use strict"; return (${generatedCode.code});`
        );

        /** @type { ExpressionFunction } */
        const exprFunction = /** @param {object} x */ (x) =>
            fn(x, globalObject);
        exprFunction.fields = generatedCode.fields;
        exprFunction.globals = generatedCode.globals;
        exprFunction.code = generatedCode.code;

        return exprFunction;
    } catch (e) {
        throw new Error(`Invalid expression: ${expr}, ${e.message}`);
    }
}
