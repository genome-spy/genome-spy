import { parseExpression, codegenExpression, functions } from "vega-expression";
import {
    isArray,
    isBoolean,
    isNumber,
    isObject,
    isRegExp,
    isString,
    ascending,
    lerp,
} from "vega-util";
import { format as d3format } from "d3-format";
import smoothstep from "./smoothstep.js";
import clamp from "./clamp.js";
import linearstep from "./linearstep.js";

/**
 * Some bits are adapted from https://github.com/vega/vega/blob/main/packages/vega-functions/src/codegen.js
 *
 * @param {unknown} value
 * @returns {any}
 */
function array(value) {
    return isArray(value) || ArrayBuffer.isView(value) ? value : null;
}

/**
 * @param {unknown} value
 * @returns {any}
 */
function sequence(value) {
    return array(value) || (isString(value) ? value : null);
}

const functionContext = {
    clamp,
    format(/** @type {number} */ value, /** @type {string} */ format) {
        return d3format(format)(value);
    },
    /**
     * Vega's expression docs list these as basic sequence helpers, but the
     * bundled `vega-expression` version does not currently include them in the
     * codegen whitelist. Implement them here so specs can rely on them.
     */
    join(/** @type {any} */ seq, /** @type {string} */ separator) {
        return array(seq).join(separator);
    },

    indexof(
        /** @type {any} */ seq,
        /** @type {any} */ value,
        /** @type {number | undefined} */ start
    ) {
        return sequence(seq).indexOf(value, start);
    },

    lastindexof(
        /** @type {any} */ seq,
        /** @type {any} */ value,
        /** @type {number | undefined} */ start
    ) {
        return sequence(seq).lastIndexOf(value, start);
    },

    reverse(/** @type {any} */ seq) {
        return array(seq).slice().reverse();
    },

    slice(
        /** @type {any} */ seq,
        /** @type {number} */ start,
        /** @type {number | undefined} */ end
    ) {
        return sequence(seq).slice(start, end);
    },
    mapHasKey(/** @type {Map<any, any>} */ map, /** @type {any} */ key) {
        return map.has(key);
    },
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
        return _ != null && _ === _;
    },
    lerp,
    linearstep,
    replace(
        /** @type {string} */ str,
        /** @type {RegExp} */ pattern,
        /** @type {string} */ replace
    ) {
        return String(str).replace(pattern, replace);
    },
    sort(/** @type {Array<any>} */ seq) {
        return array(seq).slice().sort(ascending);
    },
    smoothstep,
};

/**
 * @param {typeof codegenExpression} codegen
 */
function buildFunctions(codegen) {
    const fn = functions(codegen);
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
        throw new Error(`Invalid expression: ${expr}, ${e.message}`, {
            cause: e,
        });
    }
}

const eventFilterCg = codegenExpression({
    forbidden: [],
    allowed: ["event"],
    globalvar: "globalObject",
});

/**
 * @param {string} expr
 * @returns {(event: UIEvent | import("./interactionEvent.js").WheelLikeEvent) => boolean}
 */
export function createEventFilterFunction(expr) {
    try {
        const parsed = parseExpression(expr);
        const generatedCode = eventFilterCg(parsed);

        const fn = Function(
            "event",
            "globalObject",
            `"use strict";
            try {
                return !!(${generatedCode.code});
            } catch (e) {
                throw new Error("Error evaluating expression: " + ${JSON.stringify(
                    expr
                )} + ", " + e.message, e);
            }`
        );

        return /** @type {(event: UIEvent | import("./interactionEvent.js").WheelLikeEvent) => boolean} */ (
            /** @type {any} */ (fn)
        );
    } catch (e) {
        throw new Error(`Invalid expression: ${expr}, ${e.message}`, {
            cause: e,
        });
    }
}
