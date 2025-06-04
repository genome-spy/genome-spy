import { isString } from "vega-util";
import createFunction from "../utils/expression.js";
import {
    asSelectionConfig,
    createIntervalSelection,
    createMultiPointSelection,
    createSinglePointSelection,
    isIntervalSelectionConfig,
    isPointSelectionConfig,
} from "../selection/selection.js";

/**
 * A class that manages parameters and expressions.
 * Supports nesting and scoped parameters.
 *
 * TODO: The proposed JavaScript signals may provide a better way to implement this.
 * https://github.com/proposal-signals/proposal-signals
 *
 * @typedef {import("../utils/expression.js").ExpressionFunction & { addListener: (listener: () => void) => void, invalidate: () => void, identifier: () => string}} ExprRefFunction
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
            setter = this.allocateSetter(name, param.value);
        } else if ("expr" in param) {
            const expr = this.createExpression(param.expr);
            // TODO: getSetter(param) should return a setter that throws if
            // modifying the value is attempted.
            const realSetter = this.allocateSetter(name, expr(null));
            expr.addListener(() => realSetter(expr(null)));
            // NOP
            setter = (_) => undefined;
        } else {
            setter = this.allocateSetter(name, null);
        }

        if ("select" in param) {
            const select = asSelectionConfig(param.select);
            if (isPointSelectionConfig(select)) {
                // Set initial value so that production rules in shaders can be generated, etc.
                setter(
                    select.toggle
                        ? createMultiPointSelection()
                        : createSinglePointSelection(null)
                );
            } else if (isIntervalSelectionConfig(select)) {
                if (!select.encodings) {
                    throw new Error(
                        `Interval selection "${name}" must have encodings defined!`
                    );
                }
                setter(createIntervalSelection(select.encodings));
            }
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
         * Detach listeners. This must be called if the expression is no longer used.
         * TODO: What if the expression is used in multiple places?
         */
        fn.invalidate = () => {
            for (const [param, mediator] of mediatorsForParams) {
                for (const listener of myListeners) {
                    mediator.paramListeners.get(param)?.delete(listener);
                }
            }
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
            `ExprRef ${JSON.stringify(
                x
            )} not allowed here. Expected a scalar value.`
        );
    }
    return /** @type {T} */ (x);
}

/**
 * @param {Parameter} param
 * @returns {param is import("../spec/parameter.js").VariableParameter}
 */
export function isVariableParameter(param) {
    return ("expr" in param || "bind" in param) && !("select" in param);
}

/**
 * @param {Parameter} param
 * @returns {param is import("../spec/parameter.js").SelectionParameter}
 */
export function isSelectionParameter(param) {
    return !("expr" in param || "bind" in param) && "select" in param;
}

/**
 * Takes a record of properties that may have ExprRefs as values. Converts the
 * ExprRefs to getters and setups a listener that is called when any of the
 * expressions (upstream parameters) change.
 *
 * @param {ParamMediator} paramMediator
 * @param {T} props The properties object
 * @param {(props: (keyof T)[]) => void} [listener] Listener to be called when any of the expressions change
 * @returns T
 * @template {Record<string, any | import("../spec/parameter.js").ExprRef>} T
 */
export function activateExprRefProps(paramMediator, props, listener) {
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
            const fn = paramMediator.createExpression(value.expr);
            if (listener) {
                fn.addListener(() => batchPropertyChange(key));
            }

            Object.defineProperty(activatedProps, key, {
                enumerable: true,
                get() {
                    return fn();
                },
            });
        } else {
            activatedProps[key] = value;
        }
    }

    return /** @type {T} */ (activatedProps);
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
            `Invalid parameter name: ${name}. Must be a valid JavaScript identifier.`
        );
    }

    return name;
}

/**
 * Creates a function that always returns the same value.
 * Provides functionality for creating a constant expression reference.
 * They just do nothing.
 *
 * @param {any} value
 * @returns {ExprRefFunction}
 */
export function makeConstantExprRef(value) {
    return Object.assign(() => value, {
        addListener: () => /** @type {void} */ (undefined),
        invalidate: () => /** @type {void} */ (undefined),
        identifier: () => "constant",
        fields: [],
        globals: [],
        code: JSON.stringify(value),
    });
}
