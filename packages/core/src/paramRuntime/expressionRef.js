import { compileExpression } from "./expressionCompiler.js";

/**
 * @typedef {{
 *   expression: import("./types.js").ExprRefFunction,
 *   dependencies: import("./types.js").ParamRef<any>[]
 * }} BoundExpression
 */

/**
 * Binds expression globals to parameter refs in a specific scope and equips the
 * resulting expression function with listener lifecycle helpers.
 *
 * @param {string} expr
 * @param {(name: string) => import("./types.js").ParamRef<any> | undefined} resolve
 * @returns {BoundExpression}
 */
export function bindExpression(expr, resolve) {
    const globalObject = {};

    /** @type {import("./types.js").ExprRefFunction} */
    const expression = /** @type {any} */ (
        compileExpression(expr, globalObject)
    );

    /** @type {Map<string, import("./types.js").ParamRef<any>>} */
    const refsForParams = new Map();

    for (const globalName of expression.globals) {
        if (refsForParams.has(globalName)) {
            continue;
        }

        const ref = resolve(globalName);
        if (!ref) {
            throw new Error(
                'Unknown variable "' + globalName + '" in expression: ' + expr
            );
        }

        refsForParams.set(globalName, ref);

        Object.defineProperty(globalObject, globalName, {
            enumerable: true,
            get() {
                return ref.get();
            },
        });
    }

    /** @type {Set<() => void>} */
    const activeSubscriptions = new Set();

    expression.subscribe = (listener) => {
        /** @type {(() => void)[]} */
        const disposers = [];
        for (const ref of refsForParams.values()) {
            disposers.push(ref.subscribe(listener));
        }

        let active = true;
        const unsubscribe = () => {
            if (!active) {
                return;
            }
            active = false;
            activeSubscriptions.delete(unsubscribe);
            disposers.forEach((dispose) => dispose());
        };
        activeSubscriptions.add(unsubscribe);

        return unsubscribe;
    };

    expression.invalidate = () => {
        for (const unsubscribe of activeSubscriptions) {
            unsubscribe();
        }
        activeSubscriptions.clear();
    };

    // Include dependency identities to avoid collisions between structurally
    // identical expressions in different scopes.
    expression.identifier = () =>
        expression.code +
        "|" +
        Array.from(refsForParams.values())
            .map((ref) => ref.id)
            .join(",");

    return {
        expression,
        dependencies: Array.from(refsForParams.values()),
    };
}
