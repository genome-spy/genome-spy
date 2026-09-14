import { isString } from "vega-util";
import {
    asSelectionConfig,
    createIntervalSelection,
    createMultiPointSelection,
    createSinglePointSelection,
    isIntervalSelectionConfig,
    isPointSelectionConfig,
} from "../selection/selection.js";
import { createRulerValue } from "../ruler/rulerValue.js";

/**
 * @typedef {import("../utils/expression.js").ExpressionFunction & {
 *   dependencies: import("./types.js").ParamRef<any>[],
 *   subscribe: (listener: () => void) => () => void,
 *   invalidate: () => void,
 *   identifier: () => string
 * }} ExprRefFunction
 */

/**
 * @typedef {{
 *   scopeOwned?: boolean,
 *   registerDisposer?: (disposer: () => void) => void
 * }} WatchExpressionOptions
 */

/**
 * @typedef {{
 *   createExpression: (expr: string) => ExprRefFunction,
 *   watchExpression?: (
 *     expr: string,
 *     listener: () => void,
 *     options?: WatchExpressionOptions
 *   ) => ExprRefFunction,
 *   computed: <T>(
 *     name: string,
 *     deps: import("./types.js").ParamRef<any>[],
 *     fn: () => T,
 *     options?: { equals?: (a: T, b: T) => boolean }
 *   ) => import("./types.js").ComputedParamRef<T>,
 *   effect: (
 *     deps: import("./types.js").ParamRef<any>[],
 *     fn: () => void
 *   ) => () => void
 * }} ExprRefRuntime
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
    return (
        ("expr" in param || "bind" in param) &&
        !("select" in param) &&
        !("ruler" in param)
    );
}

/**
 * @param {import("../spec/parameter.js").Parameter} param
 * @returns {param is import("../spec/parameter.js").SelectionParameter}
 */
export function isSelectionParameter(param) {
    return !("expr" in param || "bind" in param) && "select" in param;
}

/**
 * @param {import("../spec/parameter.js").Parameter} param
 * @returns {param is import("../spec/parameter.js").RulerParameter}
 */
export function isRulerParameter(param) {
    return (
        !("expr" in param || "bind" in param || "select" in param) &&
        "ruler" in param
    );
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

    if ("ruler" in param) {
        return createRulerValue(param.ruler.encodings, param.value);
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
 * @param {ExprRefRuntime} paramRuntime
 * @param {T} props The properties object
 * @param {(props: ReadonlySet<keyof T>) => void} [listener] Listener to be called when any of the expressions change
 * @param {(disposer: () => void) => void} [registerDisposer]
 * @param {{ key: keyof T, expr: import("../spec/parameter.js").ExprRef }[]} [additionalExpressions]
 * @returns T
 * @template {Record<string, any | import("../spec/parameter.js").ExprRef>} T
 */
export function activateExprRefProps(
    paramRuntime,
    props,
    listener,
    registerDisposer,
    additionalExpressions = []
) {
    /** @type {Record<string, any | import("../spec/parameter.js").ExprRef>} */
    const activatedProps = { ...props };

    /** @type {{ key: keyof T, fn: ExprRefFunction }[]} */
    const bindings = [];
    for (const [key, value] of Object.entries(props)) {
        if (isExprRef(value)) {
            const fn = paramRuntime.createExpression(value.expr);
            const index = bindings.push({ key, fn }) - 1;
            Object.defineProperty(activatedProps, key, {
                enumerable: true,
                get: listener ? () => values.get()[index] : () => fn(null),
            });
        } else {
            activatedProps[key] = value;
        }
    }

    if (!listener) {
        return /** @type {T} */ (activatedProps);
    }

    for (const { key, expr } of additionalExpressions) {
        bindings.push({ key, fn: paramRuntime.createExpression(expr.expr) });
    }
    if (!bindings.length) {
        return /** @type {T} */ (activatedProps);
    }

    const dependencies = Array.from(
        new Set(bindings.flatMap(({ fn }) => fn.dependencies))
    );
    const values = paramRuntime.computed(
        "expression properties",
        dependencies,
        () => bindings.map(({ fn }) => fn(null)),
        { equals: shallowArrayEquals }
    );
    let previous = values.get();
    const disposeEffect = paramRuntime.effect([values], () => {
        const next = values.get();
        const changed = new Set(
            bindings
                .filter((_, i) => previous[i] !== next[i])
                .map(({ key }) => key)
        );
        previous = next;
        listener(changed);
    });

    registerDisposer?.(values.dispose);
    registerDisposer?.(disposeEffect);

    return /** @type {T} */ (activatedProps);
}

/**
 * @param {unknown[]} a
 * @param {unknown[]} b
 */
function shallowArrayEquals(a, b) {
    return a.every((value, i) => value === b[i]);
}

/**
 * Resolves a literal or ExprRef for properties that may be parameterized during
 * view construction but are not safe to update reactively. This is intended for
 * structural options, such as layout regions or view ownership, where a later
 * value change would require rebuilding part of the view hierarchy. ExprRefs
 * are evaluated once and subscribed with a fail-fast listener.
 *
 * @param {ExprRefRuntime} paramRuntime
 * @param {T | import("../spec/parameter.js").ExprRef} value
 * @param {string} errorMessage Error thrown if an ExprRef changes after initialization
 * @param {(disposer: () => void) => void} [registerDisposer]
 * @returns {T}
 * @template T
 */
export function resolveInitOnlyExprRef(
    paramRuntime,
    value,
    errorMessage,
    registerDisposer
) {
    if (!isExprRef(value)) {
        return value;
    }

    const throwUnsupportedChange = () => {
        throw new Error(errorMessage);
    };
    const fn = paramRuntime.watchExpression
        ? paramRuntime.watchExpression(value.expr, throwUnsupportedChange, {
              scopeOwned: false,
              registerDisposer,
          })
        : paramRuntime.createExpression(value.expr);
    if (!paramRuntime.watchExpression) {
        const unsubscribe = fn.subscribe(throwUnsupportedChange);
        registerDisposer?.(unsubscribe);
    }

    return fn();
}

/**
 * Creates a function that always returns the same value.
 *
 * @param {any} value
 * @returns {ExprRefFunction}
 */
export function makeConstantExprRef(value) {
    return Object.assign(() => value, {
        dependencies: [],
        subscribe: () => () => /** @type {void} */ (undefined),
        invalidate: () => /** @type {void} */ (undefined),
        identifier: () => "constant",
        fields: [],
        globals: [],
        code: JSON.stringify(value),
    });
}
