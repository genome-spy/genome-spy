import { isString } from "vega-util";
import ParamRuntime from "./paramRuntime.js";
import { makeLerpSmoother } from "../utils/animator.js";
import {
    getDefaultParamValue,
    isSelectionParameter,
    validateParameterName,
} from "./paramUtils.js";

export {
    activateExprRefProps,
    getDefaultParamValue,
    isExprRef,
    isRulerParameter,
    isSelectionParameter,
    isVariableParameter,
    makeConstantExprRef,
    validateParameterName,
    withoutExprRef,
} from "./paramUtils.js";

/**
 * @typedef {object} ViewParamRuntimeDebugState
 * @prop {string} scopeId
 * @prop {boolean} disposed
 * @prop {ViewParamDebugState[]} params
 */

/**
 * @typedef {object} ViewParamDebugState
 * @prop {string} name
 * @prop {"auto" | "base" | "derived" | "selection" | "ruler" | "push"} kind
 * @prop {any} value
 * @prop {boolean} writable
 * @prop {boolean} configured
 * @prop {import("../spec/parameter.js").Parameter | undefined} config
 * @prop {any} [target]
 */

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
     * @typedef {object} TransitionState
     * @prop {number} target
     * @prop {((target: { value: number }) => void) & { stop: () => void, snap: (target: { value: number }) => void }} smoother
     * @prop {() => void} dispose
     *
     * @typedef {object} SetValueOptions
     * @prop {boolean} [animate=true]
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

    /** @type {Map<string, (value: any, options?: SetValueOptions) => void>} */
    #allocatedSetters = new Map();

    /** @type {Map<string, import("./types.js").ParamRef<any>>} */
    #localRefs = new Map();

    /** @type {Map<string, Parameter>} */
    #paramConfigs = new Map();

    /** @type {Map<string, TransitionState>} */
    #transitionStates = new Map();

    /** @type {() => ViewParamRuntime} */
    #parentFinder;

    /** @type {(channel: string) => import("../scales/scaleResolution.js").default | undefined} */
    #scaleResolutionResolver;

    /** @type {import("../utils/animator.js").default | undefined} */
    #animator;

    /**
     * True when transitioned updates should snap instead of animate.
     * View-owned runtimes start in this mode because upstream scale/config
     * finalization may correct expression values that were first evaluated
     * against placeholder scale state.
     *
     * Standalone runtimes default to false because they do not have a separate
     * view preparation phase.
     *
     * @type {boolean}
     */
    #snapTransitionedUpdates;

    #disposed = false;

    /**
     * @param {() => ViewParamRuntime} [parentFinder]
     * @param {(channel: import("../spec/channel.js").ChannelWithScale) => import("../scales/scaleResolution.js").default | undefined} [scaleResolutionResolver]
     *      Optional resolver for scale channels in this runtime's view scope.
     *      N.B. The function must always return the same resolution for the
     *      same channel in the same view hierarchy.
     * @param {import("../utils/animator.js").default} [animator]
     * @param {{ snapTransitionedUpdates?: boolean }} [options]
     */
    constructor(parentFinder, scaleResolutionResolver, animator, options = {}) {
        this.#parentFinder = parentFinder ?? (() => undefined);
        this.#scaleResolutionResolver =
            scaleResolutionResolver ?? (() => undefined);
        this.#animator = animator;
        this.#snapTransitionedUpdates =
            options.snapTransitionedUpdates ?? false;

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

        validateParameterShape(param);

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
            if (
                "expr" in outerProps ||
                "select" in outerProps ||
                "ruler" in outerProps
            ) {
                throw new Error(
                    `The outer parameter "${name}" must not have expr, select, or ruler properties!`
                );
            }
            setter = (
                /** @type {any} */
                value
            ) => {
                outerRuntime.setValue(name, value);
            };
            // The following will become a bit fragile if the view hierarchy is going to
            // support mutation (i.e. adding/removing children) in future.
            this.#allocatedSetters.set(name, setter);
            if ("ruler" in param) {
                defaultValue = getDefaultParamValue(param, this);
                setter(defaultValue);
            }
        } else if ("value" in param) {
            defaultValue = getDefaultParamValue(param, this);
            if ("transition" in param) {
                setter = this.#registerTransitionedBaseSetter(
                    name,
                    defaultValue,
                    param.transition
                );
            } else {
                setter = this.#registerBaseSetter(name, defaultValue);
            }
        } else if ("expr" in param) {
            if ("transition" in param) {
                this.#registerTransitionedExpression(
                    name,
                    param.expr,
                    param.transition
                );
            } else {
                const ref = this.#runtime.registerDerived(
                    this.#scopeId,
                    name,
                    param.expr,
                    {
                        resolveScaleResolution: this.#scaleResolutionResolver,
                    }
                );
                this.#localRefs.set(name, ref);
            }
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
     * Sets a writable parameter value in this runtime scope.
     *
     * Only parameters with locally registered writable setters are supported.
     * This method does not resolve through ancestors.
     *
     * @param {string} paramName
     * @param {any} value
     * @param {SetValueOptions} [options]
     */
    setValue(paramName, value, options) {
        validateParameterName(paramName);
        const setter = this.#allocatedSetters.get(paramName);
        if (!setter) {
            throw new Error(
                "Writable parameter not found in this scope: " + paramName
            );
        }
        setter(value, options);
    }

    /**
     * Get the value of a parameter from this runtime.
     * @param {string} paramName
     */
    getValue(paramName) {
        return this.#localRefs.get(paramName)?.get();
    }

    /**
     * Gets the target value for a local parameter. Non-transitioned parameters
     * use their current value as the target.
     *
     * @param {string} paramName
     */
    getTargetValue(paramName) {
        validateParameterName(paramName);
        return (
            this.#transitionStates.get(paramName)?.target ??
            this.getValue(paramName)
        );
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
     * Gets the target value of a parameter from this runtime or its ancestors.
     *
     * @param {string} paramName
     */
    findTargetValue(paramName) {
        const runtime = this.findRuntimeForParam(paramName);
        return runtime?.getTargetValue(paramName);
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
     * Returns true if this runtime scope owns a local binding for the parameter.
     *
     * @param {string} paramName
     * @returns {boolean}
     */
    hasLocalParam(paramName) {
        validateParameterName(paramName);
        return this.#localRefs.has(paramName);
    }

    /**
     * Returns true if this runtime scope or any ancestor scope contains a
     * parameter registered through `registerParam`.
     *
     * Auto-allocated setters such as layout width/height are intentionally
     * ignored so that only explicit parameter configs shadow descendant
     * auto-size params.
     *
     * @param {string} paramName
     * @returns {boolean}
     */
    hasConfiguredParamInScopeChain(paramName) {
        validateParameterName(paramName);

        if (this.#paramConfigs.has(paramName)) {
            return true;
        }

        return (
            this.#parentFinder()?.hasConfiguredParamInScopeChain(paramName) ??
            false
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

    /**
     * @returns {ViewParamRuntimeDebugState}
     */
    getDebugState() {
        /** @type {ViewParamDebugState[]} */
        const params = [];

        for (const [name, ref] of this.#localRefs) {
            const config = this.#paramConfigs.get(name);
            params.push({
                name,
                kind: getParamKind(config),
                value: ref.get(),
                writable: this.#allocatedSetters.has(name),
                configured: Boolean(config),
                config: config ? structuredClone(config) : undefined,
                target: this.#transitionStates.get(name)?.target,
            });
        }

        return {
            scopeId: this.#scopeId,
            disposed: this.#disposed,
            params,
        };
    }

    // Setter lifecycle is scope-owned: setters are dropped when the runtime scope
    // is disposed. A standalone deallocation API is intentionally not exposed.

    /**
     * Parse expr and return a function that returns the value of the parameter.
     *
     * @param {string} expr
     */
    createExpression(expr) {
        return this.#runtime.createExpression(this.#scopeId, expr, {
            resolveScaleResolution: this.#scaleResolutionResolver,
        });
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
     * @param {string} name
     * @param {any} defaultValue
     * @param {import("../spec/parameter.js").ParamTransition} transition
     * @returns {(value: any, options?: SetValueOptions) => void}
     */
    #registerTransitionedBaseSetter(name, defaultValue, transition) {
        const state = this.#registerTransitionState(
            name,
            defaultValue,
            transition
        );
        const setter = (
            /** @type {any} */
            value,
            /** @type {SetValueOptions | undefined} */
            options
        ) => {
            this.#setTransitionTarget(name, state, value, options);
        };
        this.#allocatedSetters.set(name, setter);

        return setter;
    }

    /**
     * @param {string} name
     * @param {string} expr
     * @param {import("../spec/parameter.js").ParamTransition} transition
     */
    #registerTransitionedExpression(name, expr, transition) {
        const expression = this.createExpression(expr);
        const state = this.#registerTransitionState(
            name,
            expression(null),
            transition
        );
        const unsubscribe = expression.subscribe(() => {
            this.#setTransitionTarget(name, state, expression(null), {
                animate: !this.#snapTransitionedUpdates,
            });
        });
        this.#runtime.addScopeDisposer(this.#scopeId, unsubscribe);
    }

    /**
     * @param {string} name
     * @param {any} defaultValue
     * @param {import("../spec/parameter.js").ParamTransition} transition
     * @returns {TransitionState}
     */
    #registerTransitionState(name, defaultValue, transition) {
        const initialValue = validateTransitionValue(name, defaultValue);
        const ref = this.#runtime.registerBase(
            this.#scopeId,
            name,
            initialValue
        );
        this.#localRefs.set(name, ref);

        const animator = this.#animator;
        if (!animator) {
            throw new Error(
                `The parameter "${name}" uses transition but no animator is available.`
            );
        }

        const smoother = makeLerpSmoother(
            animator,
            ({ value }) => {
                ref.set(value);
                this.#runtime.flushNow();
            },
            transition.halfLife ?? 80,
            transition.epsilon ?? 0.01,
            { value: ref.get() }
        );
        const state = {
            target: ref.get(),
            smoother,
            dispose: () => {
                smoother.stop();
                this.#transitionStates.delete(name);
            },
        };

        this.#transitionStates.set(name, state);
        this.#runtime.addScopeDisposer(this.#scopeId, state.dispose);

        return state;
    }

    /**
     * @param {string} name
     * @param {TransitionState} state
     * @param {any} value
     * @param {SetValueOptions} [options]
     */
    #setTransitionTarget(name, state, value, options = {}) {
        const target = validateTransitionValue(name, value);
        state.target = target;
        if (options.animate === false) {
            state.smoother.snap({ value: target });
        } else {
            state.smoother({ value: target });
        }
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

    /**
     * Marks this runtime scope as fully prepared for interactive updates.
     * Later expression changes animate according to the parameter transition.
     */
    finalizeInitialization() {
        this.#snapTransitionedUpdates = false;
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
        this.#transitionStates.clear();
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

/**
 * @param {import("../spec/parameter.js").Parameter | undefined} config
 * @returns {"auto" | "base" | "derived" | "selection" | "ruler" | "push"}
 */
function getParamKind(config) {
    if (!config) {
        return "auto";
    }

    if (config.push === "outer") {
        return "push";
    } else if ("select" in config) {
        return "selection";
    } else if ("ruler" in config) {
        return "ruler";
    } else if ("expr" in config) {
        return "derived";
    } else {
        return "base";
    }
}

/**
 * @param {import("../spec/parameter.js").Parameter} param
 */
function validateParameterShape(param) {
    const name = param.name;

    if ("value" in param && "expr" in param) {
        throw new Error(
            `The parameter "${name}" must not have both value and expr properties!`
        );
    }

    if ("expr" in param && "bind" in param) {
        throw new Error(
            `The parameter "${name}" must not have both expr and bind properties!`
        );
    }

    if (!("transition" in param)) {
        return;
    }

    if ("select" in param || "ruler" in param || param.push === "outer") {
        throw new Error(
            `The parameter "${name}" must not use transition with select, ruler, or push.`
        );
    }

    if (!("value" in param || "expr" in param)) {
        throw new Error(
            `The transitioned parameter "${name}" must have a value or expr property.`
        );
    }

    const transition =
        /** @type {import("../spec/parameter.js").ParamTransition} */ (
            param.transition
        );
    if (!transition) {
        throw new Error(
            `The parameter "${name}" must have a transition configuration.`
        );
    }

    if (transition.type !== "lerp") {
        throw new Error(
            `Unsupported transition type for parameter "${name}": ${transition.type}`
        );
    }

    if (
        transition.halfLife != null &&
        (!Number.isFinite(transition.halfLife) || transition.halfLife <= 0)
    ) {
        throw new Error(
            `The transition halfLife for parameter "${name}" must be a positive finite number.`
        );
    }

    if (
        transition.epsilon != null &&
        (!Number.isFinite(transition.epsilon) || transition.epsilon < 0)
    ) {
        throw new Error(
            `The transition epsilon for parameter "${name}" must be a non-negative finite number.`
        );
    }
}

/**
 * @param {string} name
 * @param {any} value
 * @returns {number}
 */
function validateTransitionValue(name, value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(
            `Transitioned parameter "${name}" must have a finite numeric value.`
        );
    }

    return value;
}
