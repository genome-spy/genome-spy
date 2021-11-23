import { parseExpression, codegenExpression } from "vega-expression";

/**
 *
 * @param {string} expr
 */
export default function createFunction(expr, global = {}) {
    const cg = codegenExpression({
        forbidden: [],
        allowed: ["datum"],
        globalvar: "global",
        fieldvar: "datum",
    });

    try {
        const parsed = parseExpression(expr);
        const generatedCode = cg(parsed);

        // eslint-disable-next-line no-new-func
        const fn = Function(
            "datum",
            "global",
            `"use strict"; return (${generatedCode.code});`
        );

        const exprFunction = /** @param {object} x */ (x) => fn(x, global);
        exprFunction.fields = generatedCode.fields;
        return exprFunction;
    } catch (e) {
        throw new Error(`Invalid expression: ${expr}, ${e.message}`);
    }
}
