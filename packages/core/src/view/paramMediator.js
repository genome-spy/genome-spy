import createFunction from "../utils/expression.js";

/**
 * A class that manages parameters and expressions. Still a work in progress.
 *
 * TODO: Write tests for this class.
 *
 * This should eventually handle the following:
 * - Parameter registration
 * - Dependency tracking
 * - Calling observers when a parameter changes
 * - Somehow saving parameter "state" (in bookmarks)
 * - Maybe something else
 *
 * @typedef {import("../utils/expression.js").ExpressionFunction & { addListener: (listener: () => void) => void, invalidate: () => void}} ExprRefFunction
 */
export default class ParamMediator {
    /**
     * @typedef {import("../spec/parameter.js").VariableParameter} VariableParameter
     */

    /** @type {Map<string, any>} */
    #params;

    /**
     * @type {Map<string, Set<() => void>>}
     * @protected
     */
    paramListeners;

    /** @type {Map<string, (value: any) => void>} */
    #allocatedSetters = new Map();

    /** @type {Map<string, VariableParameter>} */
    #paramConfigs = new Map();

    /** @type {() => ParamMediator} */
    #parentFinder;

    /**
     *
     * @param {() => ParamMediator} [parentFinder]
     */
    constructor(parentFinder) {
        this.#parentFinder = parentFinder ?? (() => undefined);

        this.#params = new Map();
        this.paramListeners = new Map();
    }

    /**
     * @param {VariableParameter} param
     */
    registerParam(param) {
        const setter = this.allocateSetter(param.name, param.value);
        this.#paramConfigs.set(param.name, param);
        return setter;
    }

    /**
     *
     * @param {string} paramName
     * @param {T} initialValue
     * @returns {(value: T) => void}
     * @template T
     */
    allocateSetter(paramName, initialValue) {
        if (this.#allocatedSetters.has(paramName)) {
            throw new Error(
                "Setter already allocated for parameter: " + paramName
            );
        }

        /** @type {(value: any) => void} */
        const setter = (value) => {
            const previous = this.#params.get(paramName);
            if (value !== previous) {
                this.#params.set(paramName, value);

                const listeners = this.paramListeners.get(paramName);
                if (listeners) {
                    for (const listener of listeners) {
                        listener();
                    }
                }
            }
        };

        setter(initialValue);

        this.#allocatedSetters.set(paramName, setter);

        return setter;
    }

    /**
     * @param {string} paramName
     */
    getParam(paramName) {
        return this.#params.get(paramName);
    }

    /**
     *
     * @param {string} paramName
     * @returns {ParamMediator}
     * @protected
     */
    findMediatorForParam(paramName) {
        if (this.#params.has(paramName)) {
            return this;
        } else {
            return this.#parentFinder()?.findMediatorForParam(paramName);
        }
    }

    // TODO: deallocateSetter

    /**
     * Parse expr and return a function that returns the value of the parameter.
     *
     * @param {string} expr
     */
    createExpression(expr) {
        const globalObject = {};

        /** @type {ExprRefFunction} */
        const fn = /** @type {any} */ (createFunction(expr, globalObject));

        /** @type {Map<string, ParamMediator>} */
        const mediatorsForParams = new Map();

        for (const param of fn.globals) {
            const mediator = this.findMediatorForParam(param);
            if (!mediator) {
                throw new Error(
                    `Unknown variable "${param}" in expression: ${expr}`
                );
            }

            mediatorsForParams.set(param, mediator);

            Object.defineProperty(globalObject, param, {
                enumerable: true,
                get() {
                    return mediator.getParam(param);
                },
            });
        }
        // TODO: There should be a way to "materialize" the global object when
        // it is used in expressions in transformation batches, i.e., when the same
        // expression is applied to multiple data objects. In that case, the global
        // object remains constant and the Map lookups cause unnecessary overhead.

        // Keep track of them so that they can be detached later
        const myListeners = new Set();

        /**
         *
         * @param {() => void} listener
         */
        fn.addListener = (listener) => {
            for (const [param, mediator] of mediatorsForParams) {
                const listeners =
                    mediator.paramListeners.get(param) ?? new Set();
                mediator.paramListeners.set(param, listeners);

                listeners.add(listener);
                myListeners.add(listener);
            }
        };

        /**
         * Detach listeners. This must be called if the expression is no longer used.
         */
        fn.invalidate = () => {
            for (const [param, mediator] of mediatorsForParams) {
                for (const listener of myListeners) {
                    mediator.paramListeners.get(param)?.delete(listener);
                }
            }
        };

        return fn;
    }
}
