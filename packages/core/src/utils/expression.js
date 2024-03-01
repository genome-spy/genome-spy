import { parseExpression, codegenExpression, functions } from "vega-expression";
import {
    isArray,
    isBoolean,
    isNumber,
    isObject,
    isRegExp,
    isString,
    lerp,
} from "vega-util";
import smoothstep from "./smoothstep.js";
import clamp from "./clamp.js";
import linearstep from "./linearstep.js";
import { selectionTest } from "../selection/selection.js";

/**
 * Some bits are adapted from https://github.com/vega/vega/blob/main/packages/vega-functions/src/codegen.js
 */
const functionContext = {
    clamp,
    isArray,
    isBoolean,
    isDefined(/** @type {any} */ _) {
        return _ !== undefined;
    },
    isNumber,
    isObject,
    isRegExp,
    isString,
    isValid(/** @type {any} */ _) {
        // eslint-disable-next-line no-self-compare
        return _ != null && _ === _;
    },
    lerp,
    linearstep,
    smoothstep,
    selectionTest,
};

/**
 * @param {typeof codegenExpression} codegen
 */
function buildFunctions(codegen) {
    const fn = functions(codegen);
    // eslint-disable-next-line guard-for-in
    for (const name in functionContext) {
        fn[name] = `this.${name}`;
    }
    return fn;
}

const cg = codegenExpression({
    forbidden: [],
    allowed: ["datum", "undefined"],
    globalvar: "globalObject",
    fieldvar: "datum",
    functions: buildFunctions,
});

/**
 * @typedef { object } ExpressionProps
 * @prop { string[] } fields
 * @prop { string[] } globals
 * @prop { string } code
 *
 * @typedef { ((datum?: import("../data/flowNode.js").Datum) => any) & ExpressionProps } ExpressionFunction
 *
 * @param {string} expr
 * @returns {ExpressionFunction}
 */
export default function createFunction(expr, globalObject = {}) {
    try {
        const parsed = parseExpression(expr);
        const generatedCode = cg(parsed);

        // eslint-disable-next-line no-new-func
        const fn = Function(
            "datum",
            "globalObject",
            `"use strict";
            try {
                return (${generatedCode.code});
            } catch (e) {
                throw new Error("Error evaluating expression: " + ${JSON.stringify(
                    expr
                )} + ", " + e.message, e);
            }`
        ).bind(functionContext);

        /** @type { ExpressionFunction } */
        const exprFunction = /** @param {object} datum */ (datum) =>
            fn(datum, globalObject);
        exprFunction.fields = generatedCode.fields;
        exprFunction.globals = generatedCode.globals;
        exprFunction.code = generatedCode.code;

        return exprFunction;
    } catch (e) {
        throw new Error(`Invalid expression: ${expr}, ${e.message}`);
    }
}
