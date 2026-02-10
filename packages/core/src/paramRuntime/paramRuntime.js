import GraphRuntime from "./graphRuntime.js";
import LifecycleRegistry from "./lifecycleRegistry.js";
import ParamStore from "./paramStore.js";
import { bindExpression } from "./expressionRef.js";

/**
 * Core-facing parameter runtime facade.
 *
 * `ParamRuntime` composes three internal subsystems:
 * 1. `ParamStore` for scoped name resolution (`scope` + `name` -> ref).
 * 2. `GraphRuntime` for reactive propagation and batching.
 * 3. `LifecycleRegistry` for owner-bound teardown.
 *
 * Most Core call sites should use this class (or `ViewParamRuntime`) instead
 * of interacting with `GraphRuntime` directly.
 *
 * Scope semantics used by this runtime:
 * 1. A scope is a runtime-only identity (`ScopeId`) with a parent pointer.
 * 2. Parameters are registered into exactly one scope.
 * 3. Name resolution is lexical/nearest-first: local scope, then parent chain.
 * 4. Shadowing is allowed across scopes (same param name in parent/child).
 * 5. Duplicate names are rejected within a single scope.
 * 6. `disposeScope` clears local bindings and owner resources while preserving
 *    scope-chain structure for descendants that still resolve through parents.
 *
 * @typedef {string} ScopeId
 */
export default class ParamRuntime {
    #lifecycleRegistry = new LifecycleRegistry();

    #graphRuntime = new GraphRuntime({
        lifecycleRegistry: this.#lifecycleRegistry,
    });

    #paramStore = new ParamStore();

    /**
     * Creates a new parameter scope.
     *
     * If `parentScope` is provided, name resolution in this scope falls back to
     * the parent chain.
     *
     * @param {ScopeId} [parentScope]
     * @returns {ScopeId}
     */
    createScope(parentScope) {
        const ownerId = this.#lifecycleRegistry.createOwner(
            "scope",
            parentScope ?? "root"
        );
        if (parentScope) {
            return this.#paramStore.createChildScope(ownerId, parentScope);
        } else {
            return this.#paramStore.createRootScope(ownerId);
        }
    }

    /**
     * Disposes all runtime resources owned by the scope and clears the scope's
     * local parameter bindings.
     *
     * Descendant scopes remain valid and continue resolving through their own
     * parent chains.
     *
     * @param {ScopeId} scope
     */
    disposeScope(scope) {
        const ownerId = this.#paramStore.getOwnerId(scope);
        this.#lifecycleRegistry.disposeOwner(ownerId);
        this.#paramStore.clearScope(scope);
    }

    /**
     * Registers a disposer that is bound to the scope lifecycle.
     *
     * The disposer is called when `disposeScope(scope)` is executed.
     *
     * @param {ScopeId} scope
     * @param {() => void} disposer
     */
    addScopeDisposer(scope, disposer) {
        const ownerId = this.#paramStore.getOwnerId(scope);
        this.#lifecycleRegistry.addDisposer(ownerId, disposer);
    }

    /**
     * Registers a writable base parameter in `scope`.
     *
     * @template T
     * @param {ScopeId} scope
     * @param {string} name
     * @param {T} initial
     * @param {{ notify?: boolean }} [options]
     * @returns {import("./types.js").WritableParamRef<T>}
     */
    registerBase(scope, name, initial, options) {
        const ownerId = this.#paramStore.getOwnerId(scope);
        const ref = this.#graphRuntime.createWritable(
            ownerId,
            name,
            "base",
            initial,
            options
        );
        return this.#paramStore.register(scope, name, ref);
    }

    /**
     * Registers a writable selection parameter in `scope`.
     *
     * Selection params are writable like base params but carry `kind:
     * "selection"` for downstream handling.
     *
     * @template T
     * @param {ScopeId} scope
     * @param {string} name
     * @param {T} initial
     * @param {{ notify?: boolean }} [options]
     * @returns {import("./types.js").WritableParamRef<T>}
     */
    registerSelection(scope, name, initial, options) {
        const ownerId = this.#paramStore.getOwnerId(scope);
        const ref = this.#graphRuntime.createWritable(
            ownerId,
            name,
            "selection",
            initial,
            options
        );
        return this.#paramStore.register(scope, name, ref);
    }

    /**
     * Registers a derived read-only parameter in `scope`.
     *
     * The expression is bound to current scope resolution and re-evaluated by
     * the graph runtime when dependencies change.
     *
     * @template T
     * @param {ScopeId} scope
     * @param {string} name
     * @param {string} expr
     * @returns {import("./types.js").ParamRef<T>}
     */
    registerDerived(scope, name, expr) {
        const { expression, dependencies } = bindExpression(
            expr,
            (globalName) => this.resolve(scope, globalName)
        );

        const ownerId = this.#paramStore.getOwnerId(scope);
        const ref = this.#graphRuntime.computed(
            ownerId,
            name,
            dependencies,
            () => expression(null)
        );
        return this.#paramStore.register(scope, name, ref);
    }

    /**
     * Creates an expression function bound to scope-based parameter resolution.
     *
     * The returned expression supports listeners (`addListener/removeListener`)
     * and can be used by callers that need expression-level reactivity without
     * registering a named derived parameter.
     *
     * @param {ScopeId} scope
     * @param {string} expr
     * @returns {import("./types.js").ExprRefFunction}
     */
    createExpression(scope, expr) {
        const { expression } = bindExpression(expr, (globalName) =>
            this.resolve(scope, globalName)
        );
        return expression;
    }

    /**
     * Resolves a parameter by name from `scope`, searching parent scopes as needed.
     * Returns the nearest matching binding, if any.
     *
     * @template T
     * @param {ScopeId} scope
     * @param {string} name
     * @returns {import("./types.js").ParamRef<T> | undefined}
     */
    resolve(scope, name) {
        return this.#paramStore.resolve(scope, name);
    }

    /**
     * Runs a transactional update against the underlying graph runtime.
     *
     * Multiple writes inside `fn` are batched and propagated after the
     * outermost transaction exits.
     *
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    runInTransaction(fn) {
        return this.#graphRuntime.runInTransaction(fn);
    }

    /**
     * Forces immediate synchronous propagation of currently queued graph work.
     */
    flushNow() {
        this.#graphRuntime.flushNow();
    }

    /**
     * Resolves when propagation/effects have settled in the graph runtime.
     *
     * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
     * @returns {Promise<void>}
     */
    whenPropagated(options) {
        return this.#graphRuntime.whenPropagated(options);
    }
}
