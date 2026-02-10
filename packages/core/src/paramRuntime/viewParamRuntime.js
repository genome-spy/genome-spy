import { isString } from "vega-util";
import ParamRuntime from "./paramRuntime.js";
import {
    getDefaultParamValue,
    isSelectionParameter,
    validateParameterName,
} from "./paramUtils.js";

export {
    activateExprRefProps,
    getDefaultParamValue,
    isExprRef,
    isSelectionParameter,
    isVariableParameter,
    makeConstantExprRef,
    validateParameterName,
    withoutExprRef,
} from "./paramUtils.js";

/**
 * A class that manages parameters and expressions.
 * Supports nesting and scoped parameters through a shared runtime graph.
 * The architecture follows signal-graph ideas (explicit dependencies, batched
 * propagation, deterministic scheduling) while keeping GenomeSpy-specific
 * parameter and expression semantics.
 *
 * @typedef {import("../utils/expression.js").ExpressionFunction & { subscribe: (listener: () => void) => () => void, invalidate: () => void, identifier: () => string}} ExprRefFunction
 */
export default class ViewParamRuntime {
    /**
     * @typedef {import("../spec/parameter.js").Parameter} Parameter
     * @typedef {(value: any) => void} ParameterSetter
     *
     * @typedef {object} WatchExpressionOptions
     * @prop {boolean} [scopeOwned=true]
     *      Whether the subscription lifecycle is owned by this runtime scope.
     *      When true, the listener is unsubscribed automatically during
     *      `dispose()` via scope disposal. Set to false when another owner
     *      (for example a `View` disposer registry) controls teardown.
     * @prop {(disposer: () => void) => void} [registerDisposer]
     *      Optional external disposer registration hook. When provided, the
     *      unsubscribe callback is passed to this hook in addition to any
     *      scope-owned registration.
     */

    /** @type {ParamRuntime} */
    #runtime;

    /** @type {string} */
    #scopeId;

    /** @type {Map<string, (value: any) => void>} */
    #allocatedSetters = new Map();

    /** @type {Map<string, import("./types.js").ParamRef<any>>} */
    #localRefs = new Map();

    /** @type {Map<string, Parameter>} */
    #paramConfigs = new Map();

    /** @type {() => ViewParamRuntime} */
    #parentFinder;

    #disposed = false;

    /**
     * @param {() => ViewParamRuntime} [parentFinder]
     *      An optional function that returns the parent runtime.
     *      N.B. The function must always return the same runtime for the same parent,
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
     * Registers a parameter definition into this runtime scope.
     *
     * Returns a writable setter for writable parameters (`value`, `select`,
     * `push: "outer"`). For derived (`expr`) parameters, the returned setter
     * throws.
     *
     * A parameter name can be registered only once per runtime scope.
     *
     * @param {Parameter} param
     * @returns {ParameterSetter}
     */
    registerParam(param) {
        const name = param.name;
        validateParameterName(name);

        if (this.#paramConfigs.has(name)) {
            throw new Error(
                'Parameter "' + name + '" already registered in this scope.'
            );
        }

        if ("value" in param && "expr" in param) {
            throw new Error(
                `The parameter "${name}" must not have both value and expr properties!`
            );
        }

        /** @type {ParameterSetter} */
        let setter;
        let defaultValue;

        if (param.push == "outer") {
            const outerRuntime = this.findRuntimeForParam(name);
            if (!outerRuntime) {
                throw new Error(
                    `Parameter "${name}" not found in outer scope!`
                );
            }

            const outerProps = outerRuntime.paramConfigs.get(name);
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
            setter = outerRuntime.getSetter(name);
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
            setter = () => {
                throw new Error('Cannot set derived parameter "' + name + '".');
            };
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
        const setter = (
            /** @type {T} */
            value
        ) => {
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
     * Get the value of a parameter from this runtime.
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
        const runtime = this.findRuntimeForParam(paramName);
        if (!runtime) {
            throw new Error("Parameter not found: " + paramName);
        }

        const ref = runtime.#localRefs.get(paramName);
        if (!ref) {
            throw new Error(
                "Parameter found without local reference: " + paramName
            );
        }

        return ref.subscribe(listener);
    }

    /**
     * Get the value of a parameter from this runtime or its ancestors.
     * @param {string} paramName
     */
    findValue(paramName) {
        const runtime = this.findRuntimeForParam(paramName);
        return runtime?.getValue(paramName);
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
     * @returns {ViewParamRuntime}
     */
    findRuntimeForParam(paramName) {
        if (this.#localRefs.has(paramName)) {
            return this;
        } else {
            return this.#parentFinder()?.findRuntimeForParam(paramName);
        }
    }

    // Setter lifecycle is scope-owned: setters are dropped when the runtime scope
    // is disposed. A standalone deallocation API is intentionally not exposed.

    /**
     * Parse expr and return a function that returns the value of the parameter.
     *
     * @param {string} expr
     */
    createExpression(expr) {
        return this.#runtime.createExpression(this.#scopeId, expr);
    }

    /**
     * Creates an expression and subscribes a listener that is automatically
     * removed according to `options` lifecycle ownership.
     *
     * Lifecycle semantics:
     * 1. `scopeOwned: true` (default): unsubscribe is bound to runtime scope
     *    disposal (`ViewParamRuntime.dispose()`).
     * 2. `scopeOwned: false`: caller must own teardown, typically via
     *    `registerDisposer` or by storing and calling the returned unsubscribe.
     * 3. `registerDisposer` can be used regardless of `scopeOwned` to bind the
     *    same unsubscribe to another lifecycle owner.
     *
     * @param {string} expr
     * @param {() => void} listener
     * @param {WatchExpressionOptions} [options]
     * @returns {ExprRefFunction}
     */
    watchExpression(expr, listener, options = {}) {
        const fn = this.createExpression(expr);
        const dispose = fn.subscribe(listener);

        if (options.scopeOwned ?? true) {
            this.#runtime.addScopeDisposer(this.#scopeId, dispose);
        }
        options.registerDisposer?.(dispose);

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
        const setter = (
            /** @type {T} */
            value
        ) => {
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
    runInTransaction(fn) {
        return this.#runtime.runInTransaction(fn);
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

    dispose() {
        if (this.#disposed) {
            return;
        }

        this.#disposed = true;
        this.#runtime.disposeScope(this.#scopeId);
        this.#allocatedSetters.clear();
        this.#localRefs.clear();
        this.#paramConfigs.clear();
    }

    /**
     * Returns true if this runtime has any parameters that are point selections.
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
