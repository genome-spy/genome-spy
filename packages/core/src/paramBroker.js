import { isString } from "vega-util";
import createFunction from "./utils/expression.js";

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
 * @typedef {import("./utils/expression.js").ExpressionFunction & { addListener: (listener: () => void) => void, invalidate: () => void}} ExprRefFunction
 */
export default class ParamBroker {
    /** @type {Map<string, any>} */
    #params;

    /** @type {Set<string>} */
    #allocatedSetters;

    /** @type {Record<string, any>} */
    #proxy;

    /** @type {Map<string, Set<() => void>>} */
    #paramListeners;

    constructor() {
        this.#params = new Map();
        this.#allocatedSetters = new Set();
        this.#paramListeners = new Map();

        this.#proxy = new Proxy(this.#params, {
            get(target, prop) {
                return isString(prop) ? target.get(prop) : undefined;
            },
        });
    }

    /**
     *
     * @param {string} paramName
     * @returns {(value: any) => void}
     */
    allocateSetter(paramName) {
        if (this.#allocatedSetters.has(paramName)) {
            throw new Error(
                "Setter already allocated for parameter: " + paramName
            );
        }

        this.#allocatedSetters.add(paramName);

        return (value) => {
            this.#params.set(paramName, value);

            const listeners = this.#paramListeners.get(paramName);
            if (listeners) {
                for (const listener of listeners) {
                    listener();
                }
            }
        };
    }

    // TODO: deallocateSetter

    /**
     * Parse expr and return a function that returns the value of the parameter.
     *
     * @param {string} expr
     */
    createExpression(expr) {
        /** @type {ExprRefFunction} */
        const fn = /** @type {any} */ (createFunction(expr, this.#proxy));

        for (const g of fn.globals) {
            if (!this.#allocatedSetters.has(g)) {
                throw new Error(
                    `Unknown variable "${g}" in expression: ${expr}`
                );
            }
        }

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
