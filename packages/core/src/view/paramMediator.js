import { isString } from "vega-util";
import createFunction from "../utils/expression.js";
import {
    getDefaultParamValue,
    isSelectionParameter,
    validateParameterName,
} from "../paramRuntime/paramUtils.js";

export {
    activateExprRefProps,
    getDefaultParamValue,
    isExprRef,
    isSelectionParameter,
    isVariableParameter,
    makeConstantExprRef,
    validateParameterName,
    withoutExprRef,
} from "../paramRuntime/paramUtils.js";

/**
 * A class that manages parameters and expressions.
 * Supports nesting and scoped parameters.
 *
 * TODO: The proposed JavaScript signals may provide a better way to implement this.
 * https://github.com/proposal-signals/proposal-signals
 *
 * @typedef {import("../utils/expression.js").ExpressionFunction & { addListener: (listener: () => void) => void, removeListener: (listener: () => void) => void, invalidate: () => void, identifier: () => string}} ExprRefFunction
 */
export default class ParamMediator {
    /**
     * @typedef {import("../spec/parameter.js").Parameter} Parameter
     * @typedef {(value: any) => void} ParameterSetter
     */

    /** @type {Map<string, any>} */
    #paramValues;

    /**
     * @type {Map<string, Set<() => void>>}
     * @protected
     */
    paramListeners;

    /** @type {Map<string, (value: any) => void>} */
    #allocatedSetters = new Map();

    /** @type {Map<string, ExprRefFunction>} */
    #expressions = new Map();

    /** @type {Map<string, Parameter>} */
    #paramConfigs = new Map();

    /** @type {() => ParamMediator} */
    #parentFinder;

    /**
     * @param {() => ParamMediator} [parentFinder]
     *      An optional function that returns the parent mediator.
     *      N.B. The function must always return the same mediator for the same parent,
     *      i.e., the changing the structure of the hierarchy is NOT supported.
     */
    constructor(parentFinder) {
        this.#parentFinder = parentFinder ?? (() => undefined);

        this.#paramValues = new Map();
        this.paramListeners = new Map();
    }

    /**
     * @param {Parameter} param
     * @returns {ParameterSetter}
     */
    registerParam(param) {
        const name = param.name;

        if ("value" in param && "expr" in param) {
            throw new Error(
                `The parameter "${name}" must not have both value and expr properties!`
            );
        }

        /** @type {ParameterSetter} */
        let setter;
        let defaultValue;

        if (param.push == "outer") {
            const outerMediator = this.findMediatorForParam(name);
            if (!outerMediator) {
                throw new Error(
                    `Parameter "${name}" not found in outer scope!`
                );
            }

            const outerProps = outerMediator.paramConfigs.get(name);
            if ("expr" in outerProps || "select" in outerProps) {
                throw new Error(
                    `The outer parameter "${name}" must not have expr or select properties!`
                );
            }
            setter = outerMediator.getSetter(name);
            // The following will become a bit fragile if the view hierarchy is going to
            // support mutation (i.e. adding/removing children) in future.
            this.#allocatedSetters.set(name, setter);
        } else if ("value" in param) {
            defaultValue = getDefaultParamValue(param, this);
            setter = this.allocateSetter(name, defaultValue);
        } else if ("expr" in param) {
            const expr = this.createExpression(param.expr);
            // TODO: getSetter(param) should return a setter that throws if
            // modifying the value is attempted.
            defaultValue = getDefaultParamValue(param, this, expr);
            const realSetter = this.allocateSetter(name, defaultValue);
            expr.addListener(() => realSetter(expr(null)));
            // NOP
            setter = (_) => undefined;
        } else {
            defaultValue = getDefaultParamValue(param, this);
            setter = this.allocateSetter(name, defaultValue);
        }

        if ("select" in param) {
            defaultValue ??= getDefaultParamValue(param, this);
            // Set initial value so that production rules in shaders can be generated, etc.
            setter(defaultValue);
        }

        this.#paramConfigs.set(name, param);

        return setter;
    }

    /**
     *
     * @param {string} paramName
     * @param {T} initialValue
     * @param {boolean} [passive] If true, the setter will not notify listeners when the value changes.
     * @returns {(value: T) => void}
     * @template T
     */
    allocateSetter(paramName, initialValue, passive = false) {
        validateParameterName(paramName);

        if (this.#allocatedSetters.has(paramName)) {
            throw new Error(
                "Setter already allocated for parameter: " + paramName
            );
        }

        /** @type {(value: any) => void} */
        const setter = (value) => {
            const previous = this.#paramValues.get(paramName);
            if (value !== previous) {
                this.#paramValues.set(paramName, value);

                const listeners = this.paramListeners.get(paramName);
                if (listeners && !passive) {
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
     * Gets an existing setter for a parameter. Throws if the setter is not found.
     * @param {string} paramName
     */
    getSetter(paramName) {
        const setter = this.#allocatedSetters.get(paramName);
        if (!setter) {
            throw new Error("Setter not found for parameter: " + paramName);
        }
        return setter;
    }

    /**
     * Get the value of a parameter from this mediator.
     * @param {string} paramName
     */
    getValue(paramName) {
        return this.#paramValues.get(paramName);
    }

    /**
     * Subscribe to changes of a parameter's value. The listener is called only
     * when the stored value changes. For expression parameters, the listener is
     * called when upstream changes re-evaluate to a different value.
     *
     * @param {string} paramName
     * @param {() => void} listener
     * @returns {() => void}
     */
    subscribe(paramName, listener) {
        validateParameterName(paramName);
        const mediator = this.findMediatorForParam(paramName);
        if (!mediator) {
            throw new Error("Parameter not found: " + paramName);
        }

        const listeners = mediator.paramListeners.get(paramName) ?? new Set();
        mediator.paramListeners.set(paramName, listeners);
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
            if (!listeners.size) {
                mediator.paramListeners.delete(paramName);
            }
        };
    }

    /**
     * Get the value of a parameter from this mediator or the ancestors.
     * @param {string} paramName
     */
    findValue(paramName) {
        const mediator = this.findMediatorForParam(paramName);
        return mediator?.getValue(paramName);
    }

    /**
     * Returns configs for all parameters that have been registered using `registerParam`.
     */
    get paramConfigs() {
        return /** @type {ReadonlyMap<string, Parameter>} */ (
            this.#paramConfigs
        );
    }

    /**
     *
     * @param {string} paramName
     * @returns {ParamMediator}
     */
    findMediatorForParam(paramName) {
        if (this.#paramValues.has(paramName)) {
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
        if (this.#expressions.has(expr)) {
            return this.#expressions.get(expr);
        }

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
                    return mediator.getValue(param);
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
         * @param {() => void} listener
         */
        fn.removeListener = (listener) => {
            for (const [param, mediator] of mediatorsForParams) {
                mediator.paramListeners.get(param)?.delete(listener);
            }
            myListeners.delete(listener);
        };

        /**
         * Detach listeners. This must be called if the expression is no longer used.
         * TODO: What if the expression is used in multiple places?
         */
        fn.invalidate = () => {
            for (const [param, mediator] of mediatorsForParams) {
                for (const listener of myListeners) {
                    mediator.paramListeners.get(param)?.delete(listener);
                }
            }
            myListeners.clear();
        };

        // TODO: This should contain unique identifier for each parameter.
        // As the same parameter name may be used in different branches of the
        // hierarchy, they should be distinguished by a unique identifier, e.g.,
        // a serial number of something similar.
        fn.identifier = () => fn.code;

        this.#expressions.set(expr, fn);

        return fn;
    }

    /**
     * A convenience method for evaluating an expression.
     *
     * @param {string} expr
     */
    evaluateAndGet(expr) {
        const fn = this.createExpression(expr);
        return fn();
    }

    /**
     * Returns true if this ParamMediator has any parameters that are point selections.
     * Point selections necessitate the use of uniqueIds in the data.
     *
     * @returns {boolean}
     */
    hasPointSelections() {
        for (const param of this.#paramConfigs.values()) {
            if (isSelectionParameter(param)) {
                const select = param.select;
                if (isString(select)) {
                    if (select == "point") {
                        return true;
                    }
                } else if (select.type == "point") {
                    return true;
                }
            }
        }

        return false;
    }
}
