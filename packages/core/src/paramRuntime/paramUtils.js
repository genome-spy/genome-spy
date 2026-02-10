import { isString } from "vega-util";
import {
    asSelectionConfig,
    createIntervalSelection,
    createMultiPointSelection,
    createSinglePointSelection,
    isIntervalSelectionConfig,
    isPointSelectionConfig,
} from "../selection/selection.js";

/**
 * @typedef {import("../utils/expression.js").ExpressionFunction & {
 *   subscribe: (listener: () => void) => () => void,
 *   invalidate: () => void,
 *   identifier: () => string
 * }} ExprRefFunction
 */

/**
 * @param {any} x
 * @returns {x is import("../spec/parameter.js").ExprRef}
 */
export function isExprRef(x) {
    return typeof x == "object" && x != null && "expr" in x && isString(x.expr);
}

/**
 * Removes ExprRef from the type and checks that the value is not an ExprRef.
 * This is designed to be used with `activateExprRefProps`.
 *
 * @param {T | import("../spec/parameter.js").ExprRef} x
 * @template T
 * @returns {T}
 */
export function withoutExprRef(x) {
    if (isExprRef(x)) {
        throw new Error(
            "ExprRef " +
                JSON.stringify(x) +
                " not allowed here. Expected a scalar value."
        );
    }
    return /** @type {T} */ (x);
}

/**
 * @param {import("../spec/parameter.js").Parameter} param
 * @returns {param is import("../spec/parameter.js").VariableParameter}
 */
export function isVariableParameter(param) {
    return ("expr" in param || "bind" in param) && !("select" in param);
}

/**
 * @param {import("../spec/parameter.js").Parameter} param
 * @returns {param is import("../spec/parameter.js").SelectionParameter}
 */
export function isSelectionParameter(param) {
    return !("expr" in param || "bind" in param) && "select" in param;
}

/**
 * Validates a parameter name. If the name is invalid, throws an error.
 * Otherwise, returns the name.
 *
 * @param {string} name
 * @returns {string} the name
 */
export function validateParameterName(name) {
    if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(name)) {
        throw new Error(
            "Invalid parameter name: " +
                name +
                ". Must be a valid JavaScript identifier."
        );
    }

    return name;
}

/**
 * Computes the default value for a parameter specification.
 *
 * @param {import("../spec/parameter.js").Parameter} param
 * @param {{ createExpression: (expr: string) => ExprRefFunction }} [paramRuntime]
 * @param {ExprRefFunction} [exprFn]
 * @returns {any}
 */
export function getDefaultParamValue(param, paramRuntime, exprFn) {
    if ("select" in param) {
        const select = asSelectionConfig(param.select);
        if (isPointSelectionConfig(select)) {
            return select.toggle
                ? createMultiPointSelection()
                : createSinglePointSelection(null);
        }
        if (isIntervalSelectionConfig(select)) {
            if (!select.encodings) {
                throw new Error(
                    'Interval selection "' +
                        param.name +
                        '" must have encodings defined!'
                );
            }
            return createIntervalSelection(select.encodings);
        }
        throw new Error(
            'Unknown selection config for parameter "' + param.name + '".'
        );
    }

    if ("expr" in param) {
        const expr =
            exprFn ??
            paramRuntime?.createExpression(/** @type {string} */ (param.expr));
        if (!expr) {
            throw new Error(
                'Cannot evaluate expression for parameter "' + param.name + '".'
            );
        }
        return expr(null);
    }

    if ("value" in param) {
        return param.value;
    }

    return null;
}

/**
 * Takes a record of properties that may have ExprRefs as values. Converts the
 * ExprRefs to getters and setups a listener that is called when any of the
 * expressions (upstream parameters) change.
 *
 * @param {{ createExpression: (expr: string) => ExprRefFunction, watchExpression?: (expr: string, listener: () => void, options?: { scopeOwned?: boolean, registerDisposer?: (disposer: () => void) => void }) => ExprRefFunction }} paramRuntime
 * @param {T} props The properties object
 * @param {(props: (keyof T)[]) => void} [listener] Listener to be called when any of the expressions change
 * @param {(disposer: () => void) => void} [registerDisposer]
 * @returns T
 * @template {Record<string, any | import("../spec/parameter.js").ExprRef>} T
 */
export function activateExprRefProps(
    paramRuntime,
    props,
    listener,
    registerDisposer
) {
    /** @type {Record<string, any | import("../spec/parameter.js").ExprRef>} */
    const activatedProps = { ...props };

    /** @type {(keyof T)[]} */
    const alteredProps = [];

    const batchPropertyChange = (/** @type {keyof T} */ prop) => {
        alteredProps.push(prop);
        if (alteredProps.length === 1) {
            queueMicrotask(() => {
                listener(alteredProps.slice());
                alteredProps.length = 0;
            });
        }
    };

    for (const [key, value] of Object.entries(props)) {
        if (isExprRef(value)) {
            if (listener) {
                const expressionListener = () => batchPropertyChange(key);
                const fn = paramRuntime.watchExpression
                    ? paramRuntime.watchExpression(
                          value.expr,
                          expressionListener,
                          {
                              scopeOwned: !registerDisposer,
                              registerDisposer,
                          }
                      )
                    : paramRuntime.createExpression(value.expr);
                if (!paramRuntime.watchExpression) {
                    const unsubscribe = fn.subscribe(expressionListener);
                    registerDisposer?.(unsubscribe);
                }

                Object.defineProperty(activatedProps, key, {
                    enumerable: true,
                    get() {
                        return fn();
                    },
                });
            } else {
                const fn = paramRuntime.createExpression(value.expr);
                Object.defineProperty(activatedProps, key, {
                    enumerable: true,
                    get() {
                        return fn();
                    },
                });
            }
        } else {
            activatedProps[key] = value;
        }
    }

    return /** @type {T} */ (activatedProps);
}

/**
 * Creates a function that always returns the same value.
 *
 * @param {any} value
 * @returns {ExprRefFunction}
 */
export function makeConstantExprRef(value) {
    return Object.assign(() => value, {
        subscribe: () => () => /** @type {void} */ (undefined),
        invalidate: () => /** @type {void} */ (undefined),
        identifier: () => "constant",
        fields: [],
        globals: [],
        code: JSON.stringify(value),
    });
}
