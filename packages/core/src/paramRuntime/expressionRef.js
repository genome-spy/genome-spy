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
 * @param {{ resolveScaleResolution?: (channel: string) => import("../scales/scaleResolution.js").default | undefined }} [options]
 * @returns {BoundExpression}
 */
export function bindExpression(expr, resolve, options = {}) {
    const globalObject = {};

    /** @type {import("./types.js").ExprRefFunction} */
    const expression = /** @type {any} */ (
        compileExpression(expr, globalObject, options)
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
        for (const ref of expression.scaleDependencies ?? []) {
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

    /**
     * Creates an evaluator optimized for repeated calls over a dataflow batch.
     * The evaluator and its globals object retain their identities; `refresh()`
     * copies batch-stable parameter values into that object before propagation.
     *
     * @returns {import("./types.js").SnapshotExpressionEvaluator}
     */
    expression.createSnapshotEvaluator = () => {
        /** @type {Record<string, any>} */
        const snapshot = {};

        for (const name of Object.keys(globalObject)) {
            if (!refsForParams.has(name)) {
                // Scale helpers and other non-parameter globals stay live. Their
                // functions already read the current runtime state when called.
                snapshot[name] = globalObject[name];
            }
        }
        for (const [name, ref] of refsForParams) {
            if (!ref.batchStable) {
                // Passive refs may change without triggering a refresh, so they
                // must retain the original per-datum lookup semantics.
                Object.defineProperty(snapshot, name, {
                    enumerable: true,
                    get: () => ref.get(),
                });
            }
        }

        const evaluator = Object.assign(expression.createEvaluator(snapshot), {
            refresh() {
                for (const [name, ref] of refsForParams) {
                    if (ref.batchStable) {
                        // Plain data properties keep expression access cheap and
                        // monomorphic throughout the batch.
                        snapshot[name] = ref.get();
                    }
                }
            },
        });
        evaluator.refresh();
        return evaluator;
    };

    // Include dependency identities to avoid collisions between structurally
    // identical expressions in different scopes.
    expression.identifier = () =>
        expression.code +
        "|" +
        Array.from(refsForParams.values())
            .map((ref) => ref.id)
            .concat((expression.scaleDependencies ?? []).map((ref) => ref.id))
            .join(",");

    expression.dependencies = Array.from(refsForParams.values()).concat(
        expression.scaleDependencies ?? []
    );
    return { expression, dependencies: expression.dependencies };
}
