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
 * @param {ScaleHelperCompileContext} context
 */
function buildFunctions(codegen, context) {
    const fn = /** @type {any} */ (functions(codegen));
    for (const name in functionContext) {
        fn[name] = `this.${name}`;
    }

    // Replace the public helper names with custom codegen hooks so we can bind
    // a scale resolution once during compilation instead of looking it up for
    // every datum.
    fn.scale = (
        /** @type {any[]} */
        args
    ) => buildScaleHelperCall(codegen, context, "scale", args);
    fn.invert = (
        /** @type {any[]} */
        args
    ) => buildScaleHelperCall(codegen, context, "invert", args);
    fn.domain = (
        /** @type {any[]} */
        args
    ) => buildScaleHelperCall(codegen, context, "domain", args);
    fn.range = (
        /** @type {any[]} */
        args
    ) => buildScaleHelperCall(codegen, context, "range", args);

    return fn;
}

/**
 * @typedef { object } ExpressionProps
 * @prop { string[] } fields
 * @prop { string[] } globals
 * @prop { string } code
 * @prop { import("../paramRuntime/types.js").ParamRef<any>[] } [scaleDependencies]
 *
 * @typedef { ((datum?: import("../data/flowNode.js").Datum) => any) & ExpressionProps } ExpressionFunction
 *
 * @typedef {object} ExpressionCompileContext
 * @prop {(channel: string) => import("../scales/scaleResolution.js").default | undefined} [resolveScaleResolution]
 *
 * @typedef {ExpressionCompileContext & {
 *   globalvar: string,
 *   globalObject: Record<string, any>,
 *   getScaleHelper: (kind: "scale" | "invert" | "domain" | "range", channel: string, resolution: import("../scales/scaleResolution.js").default) => { codeName: string, dependency: import("../paramRuntime/types.js").ParamRef<any> }
 * }} ScaleHelperCompileContext
 */

/**
 * @param {typeof codegenExpression} codegen
 * @param {ScaleHelperCompileContext} context
 * @param {"scale" | "invert" | "domain" | "range"} kind
 * @param {any[]} args
 * @returns {string}
 */
function buildScaleHelperCall(codegen, context, kind, args) {
    if (args.length === 0) {
        throw new Error(
            `Scale helper "${kind}" requires a literal channel name.`
        );
    }

    if ((kind === "scale" || kind === "invert") && args.length < 2) {
        throw new Error(
            `Scale helper "${kind}" requires a channel name and a value.`
        );
    }

    const channel = getLiteralString(args[0]);
    if (!channel) {
        throw new Error(
            `Scale helper "${kind}" requires a literal channel name.`
        );
    }

    const resolution = context.resolveScaleResolution?.(channel);
    if (!resolution) {
        throw new Error(
            `Unknown scale channel "${channel}" in expression helper "${kind}".`
        );
    }

    const helper = context.getScaleHelper(kind, channel, resolution);
    const remainingArgs = args
        .slice(1)
        .map((arg) => codegen(arg))
        .join(",");
    return `${context.globalvar}["${helper.codeName}"](${remainingArgs})`;
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function getLiteralString(node) {
    return node?.type === "Literal" && typeof node.value === "string"
        ? node.value
        : undefined;
}

/**
 * @param {"scale" | "invert" | "domain" | "range"} kind
 * @param {import("../scales/scaleResolution.js").default} resolution
 * @returns {(...args: any[]) => any}
 */
function createScaleHelperFunction(kind, resolution) {
    if (kind === "domain") {
        return () => resolution.getDomain();
    }
    if (kind === "range") {
        return () => resolution.getScale().range();
    }
    if (kind === "scale") {
        return (value) => resolution.getScale()(value);
    }
    if (kind === "invert") {
        return (value) =>
            /** @type {any} */ (resolution.getScale()).invert(value);
    }
    throw new Error("Unknown scale helper: " + kind);
}

/**
 * @param {"scale" | "invert" | "domain" | "range"} kind
 * @param {string} channel
 * @param {import("../scales/scaleResolution.js").default} resolution
 * @param {string} codeName
 * @returns {import("../paramRuntime/types.js").ParamRef<any> & { rank: number }}
 */
function createScaleDependency(kind, channel, resolution, codeName) {
    /** @type {Set<() => void>} */
    const listeners = new Set();

    const notify = () => {
        for (const listener of listeners) {
            listener();
        }
    };

    const attach = () => {
        if (kind === "domain") {
            resolution.addEventListener("domain", notify);
        } else if (kind === "range") {
            resolution.addEventListener("range", notify);
        } else {
            resolution.addEventListener("domain", notify);
            resolution.addEventListener("range", notify);
        }
    };

    const detach = () => {
        if (kind === "domain") {
            resolution.removeEventListener("domain", notify);
        } else if (kind === "range") {
            resolution.removeEventListener("range", notify);
        } else {
            resolution.removeEventListener("domain", notify);
            resolution.removeEventListener("range", notify);
        }
    };

    return {
        // The dependency is a lightweight invalidation token. It does not need
        // to expose a separate scale value; the bound helper closure already
        // closes over the actual resolution. The ref exists so the expression
        // graph can subscribe to scale changes like any other reactive input.
        id: `scale:${channel}:${codeName}`,
        name: `scale(${channel})`,
        kind: "derived",
        rank: 0,
        get() {
            return resolution.getScale();
        },
        subscribe(listener) {
            const wasEmpty = listeners.size === 0;
            listeners.add(listener);
            if (wasEmpty) {
                attach();
            }
            return () => {
                const removed = listeners.delete(listener);
                if (removed && listeners.size === 0) {
                    detach();
                }
            };
        },
    };
}

/**
 * @param {string} expr
 * @param {Record<string, any>} globalObject
 * @param {ExpressionCompileContext} context
 *
 * @returns {ExpressionFunction}
 */
export default function createFunction(expr, globalObject = {}, context = {}) {
    try {
        // Each scale helper call is rewritten once at compile time into a
        // cached closure that targets a specific scale resolution.
        /** @type {Map<string, import("../paramRuntime/types.js").ParamRef<any>>} */
        const scaleDependenciesByChannel = new Map();
        // A helper may appear multiple times in one expression. Cache both the
        // generated closure and the synthetic dependency ref so repeated calls
        // share the same reactive identity.
        /** @type {Map<string, { codeName: string, dependency: import("../paramRuntime/types.js").ParamRef<any> }>} */
        const helperEntries = new Map();
        let nextScaleHelperId = 1;

        /**
         * @type {ExpressionCompileContext & {
         *   globalvar: string,
         *   globalObject: Record<string, any>,
         *   getScaleHelper: (kind: "scale" | "invert" | "domain" | "range", channel: string, resolution: import("../scales/scaleResolution.js").default) => { codeName: string, dependency: import("../paramRuntime/types.js").ParamRef<any> }
         * }}
         */
        const helperContext = {
            ...context,
            globalvar: "globalObject",
            globalObject,
            getScaleHelper(kind, channel, resolution) {
                // Helper instances are keyed by helper kind + channel so
                // `domain("x")` and `scale("x", ...)` share the same
                // resolution binding but keep separate generated closures.
                const key = kind + ":" + channel;
                const cached = helperEntries.get(key);
                if (cached) {
                    return cached;
                }

                let dependency = scaleDependenciesByChannel.get(channel);
                if (!dependency) {
                    dependency = createScaleDependency(
                        kind,
                        channel,
                        resolution,
                        "__scale_dependency_" + nextScaleHelperId++
                    );
                    scaleDependenciesByChannel.set(channel, dependency);
                }

                const codeName = "__scale_helper_" + nextScaleHelperId++;
                const entry = { codeName, dependency };
                helperEntries.set(key, entry);
                // Store the concrete helper implementation on the global object
                // used by the generated expression function.
                globalObject[codeName] = createScaleHelperFunction(
                    kind,
                    resolution
                );
                return entry;
            },
        };

        const cg = codegenExpression({
            forbidden: [],
            allowed: ["datum", "undefined"],
            globalvar: "globalObject",
            fieldvar: "datum",
            functions: (visitor) => buildFunctions(visitor, helperContext),
        });

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
        // Reactive bookkeeping lives outside the generated expression body.
        // The expression runtime subscribes to these refs and invalidates the
        // compiled expression when the referenced scale changes.
        exprFunction.scaleDependencies = Array.from(
            scaleDependenciesByChannel.values()
        );

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
