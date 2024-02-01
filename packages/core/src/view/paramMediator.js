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
    /** @type {Map<string, any>} */
    #params;

    /** @type {Map<string, Set<() => void>>} */
    #paramListeners;

    /** @type {Map<string, (value: any) => void>} */
    #allocatedSetters = new Map();

    /** @type {() => ParamMediator} */
    #parentFinder;

    /**
     *
     * @param {() => ParamMediator} [parentFinder]
     */
    constructor(parentFinder) {
        this.#parentFinder = parentFinder ?? (() => undefined);

        this.#params = new Map();
        this.#paramListeners = new Map();
    }

    /**
     *
     * @param {string} paramName
     * @param {import("../spec/parameter.js").VariableParameter} [param]
     *      An optional parameter object to be saved for later use.
     * @returns {(value: any) => void}
     */
    allocateSetter(paramName, param) {
        if (this.#allocatedSetters.has(paramName)) {
            throw new Error(
                "Setter already allocated for parameter: " + paramName
            );
        }

        /** @type {(value: any) => void} */
        const setter = (value) => {
            this.#params.set(paramName, value);

            const listeners = this.#paramListeners.get(paramName);
            if (listeners) {
                for (const listener of listeners) {
                    listener();
                }
            }
        };

        this.#allocatedSetters.set(paramName, setter);
        setter(param?.value);

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

        for (const g of fn.globals) {
            const mediator = this.findMediatorForParam(g);
            if (!mediator) {
                throw new Error(
                    `Unknown variable "${g}" in expression: ${expr}`
                );
            }

            Object.defineProperty(globalObject, g, {
                enumerable: true,
                get() {
                    return mediator.getParam(g);
                },
            });
        }
        // TODO: There should be a way to "materialize" the global object when
        // it is used in expressions in transformation batches, i.e., the same
        // expression is applied to multiple data objects. In that case, the global
        // object remains constant and the Map lookups cause unnecessary overhead.

        // Keep track of them so that they can be detached later
        const myListeners = new Set();

        /**
         *
         * @param {() => void} listener
         */
        fn.addListener = (listener) => {
            for (const g of fn.globals) {
                const listeners = this.#paramListeners.get(g) ?? new Set();
                this.#paramListeners.set(g, listeners);
                listeners.add(listener);
                myListeners.add(listener);
            }
        };

        /**
         * Detach listeners. This must be called if the expression is no longer used.
         */
        fn.invalidate = () => {
            for (const g of fn.globals) {
                const listeners = this.#paramListeners.get(g);
                for (const listener of myListeners) {
                    listeners.delete(listener);
                }
            }
        };

        return fn;
    }
}
