import { isExprRef } from "../paramRuntime/paramUtils.js";

/**
 * Resolves a configured domain value recursively.
 *
 * This supports top-level expression refs as well as arrays containing mixed
 * constants and expression refs.
 *
 * @param {any} value
 * @param {{ createExpression: (expr: string) => () => any }} paramRuntime
 * @returns {any}
 */
export function resolveConfiguredDomainValue(value, paramRuntime) {
    if (isExprRef(value)) {
        return paramRuntime.createExpression(value.expr)();
    }

    if (Array.isArray(value)) {
        return value.map((item) =>
            resolveConfiguredDomainValue(item, paramRuntime)
        );
    }

    return value;
}

/**
 * Collects all expression refs nested inside a configured domain value.
 *
 * @param {any} value
 * @returns {import("../spec/parameter.js").ExprRef[]}
 */
export function collectConfiguredDomainExprRefs(value) {
    if (isExprRef(value)) {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap((item) => collectConfiguredDomainExprRefs(item));
    }

    return [];
}
