import { isString } from "vega-util";
import createFunction from "../utils/expression.js";
import ParamRuntime from "../paramRuntime/paramRuntime.js";
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

    /** @type {ParamRuntime} */
    #runtime;

    /** @type {string} */
    #scopeId;

    /** @type {Map<string, (value: any) => void>} */
    #allocatedSetters = new Map();

    /** @type {Map<string, import("../paramRuntime/types.js").ParamRef<any>>} */
    #localRefs = new Map();

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

        const parent = this.#parentFinder();
        if (parent) {
            this.#runtime = parent.#runtime;
            this.#scopeId = this.#runtime.createScope(parent.#scopeId);
        } else {
            this.#runtime = new ParamRuntime();
            this.#scopeId = this.#runtime.createScope();
        }
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
            if (!outerProps) {
                throw new Error(
                    `Outer parameter "${name}" exists as a value but has no registered config.`
                );
            }
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
            setter = this.#registerBaseSetter(name, defaultValue);
        } else if ("expr" in param) {
            const ref = this.#runtime.registerDerived(
                this.#scopeId,
                name,
                param.expr
            );
            this.#localRefs.set(name, ref);
            setter = (_) => undefined;
        } else {
            defaultValue = getDefaultParamValue(param, this);
            setter = this.#registerBaseSetter(name, defaultValue);
        }

        if ("select" in param) {
            defaultValue ??= getDefaultParamValue(param, this);
            if (!this.#allocatedSetters.has(name)) {
                const ref = this.#runtime.registerSelection(
                    this.#scopeId,
                    name,
                    defaultValue
                );
                this.#localRefs.set(name, ref);
                this.#allocatedSetters.set(name, (value) => {
                    ref.set(value);
                    this.#runtime.flushNow();
                });
                setter = this.#allocatedSetters.get(name);
            }
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

        const ref = this.#runtime.registerBase(
            this.#scopeId,
            paramName,
            initialValue,
            {
                notify: !passive,
            }
        );
        this.#localRefs.set(paramName, ref);
        const setter = (value) => {
            ref.set(value);
            this.#runtime.flushNow();
        };

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
        return this.#localRefs.get(paramName)?.get();
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

        const ref = mediator.#localRefs.get(paramName);
        if (!ref) {
            throw new Error(
                "Parameter found without local reference: " + paramName
            );
        }

        return ref.subscribe(listener);
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
        if (this.#localRefs.has(paramName)) {
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

        /** @type {Map<string, import("../paramRuntime/types.js").ParamRef<any>>} */
        const refsForParams = new Map();

        for (const param of fn.globals) {
            const ref = this.#runtime.resolve(this.#scopeId, param);
            if (!ref) {
                throw new Error(
                    `Unknown variable "${param}" in expression: ${expr}`
                );
            }

            refsForParams.set(param, ref);

            Object.defineProperty(globalObject, param, {
                enumerable: true,
                get() {
                    return ref.get();
                },
            });
        }
        // TODO: There should be a way to "materialize" the global object when
        // it is used in expressions in transformation batches, i.e., when the same
        // expression is applied to multiple data objects. In that case, the global
        // object remains constant and the Map lookups cause unnecessary overhead.

        /** @type {Map<() => void, (() => void)[]>} */
        const listenerDisposers = new Map();

        /**
         *
         * @param {() => void} listener
         */
        fn.addListener = (listener) => {
            if (listenerDisposers.has(listener)) {
                return;
            }

            const disposers = [];
            for (const ref of refsForParams.values()) {
                disposers.push(ref.subscribe(listener));
            }
            listenerDisposers.set(listener, disposers);
        };

        /**
         * @param {() => void} listener
         */
        fn.removeListener = (listener) => {
            const disposers = listenerDisposers.get(listener);
            if (!disposers) {
                return;
            }
            disposers.forEach((dispose) => dispose());
            listenerDisposers.delete(listener);
        };

        /**
         * Detach listeners. This must be called if the expression is no longer used.
         * TODO: What if the expression is used in multiple places?
         */
        fn.invalidate = () => {
            for (const disposers of listenerDisposers.values()) {
                disposers.forEach((dispose) => dispose());
            }
            listenerDisposers.clear();
        };

        // TODO: This should contain unique identifier for each parameter.
        // As the same parameter name may be used in different branches of the
        // hierarchy, they should be distinguished by a unique identifier, e.g.,
        // a serial number of something similar.
        fn.identifier = () => fn.code;

        return fn;
    }

    /**
     * @template T
     * @param {string} name
     * @param {T} defaultValue
     * @returns {(value: T) => void}
     */
    #registerBaseSetter(name, defaultValue) {
        const ref = this.#runtime.registerBase(
            this.#scopeId,
            name,
            defaultValue
        );
        this.#localRefs.set(name, ref);
        const setter = (value) => {
            ref.set(value);
            this.#runtime.flushNow();
        };
        this.#allocatedSetters.set(name, setter);
        return setter;
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
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    inTransaction(fn) {
        return this.#runtime.inTransaction(fn);
    }

    flushNow() {
        this.#runtime.flushNow();
    }

    /**
     * Sync barrier only: resolves when DAG propagation/effects have flushed.
     * Must not be broadened to temporal/animation convergence semantics.
     *
     * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
     */
    whenPropagated(options) {
        return this.#runtime.whenPropagated(options);
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
