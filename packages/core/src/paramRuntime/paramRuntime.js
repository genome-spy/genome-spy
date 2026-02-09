import GraphRuntime from "./graphRuntime.js";
import LifecycleRegistry from "./lifecycleRegistry.js";
import ParamStore from "./paramStore.js";
import { bindExpression } from "./expressionRef.js";

/**
 * New parameter runtime facade for Core internals.
 */
export default class ParamRuntime {
    #lifecycleRegistry = new LifecycleRegistry();

    #graphRuntime = new GraphRuntime({
        lifecycleRegistry: this.#lifecycleRegistry,
    });

    #paramStore = new ParamStore();

    /**
     * @param {string} [parentScope]
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
     * @template T
     * @param {string} scope
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
     * @template T
     * @param {string} scope
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
     * @template T
     * @param {string} scope
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
     * @param {string} scope
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
     * @template T
     * @param {string} scope
     * @param {string} name
     * @returns {import("./types.js").ParamRef<T> | undefined}
     */
    resolve(scope, name) {
        return this.#paramStore.resolve(scope, name);
    }

    /**
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    inTransaction(fn) {
        return this.#graphRuntime.inTransaction(fn);
    }

    flushNow() {
        this.#graphRuntime.flushNow();
    }

    /**
     * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
     */
    whenPropagated(options) {
        return this.#graphRuntime.whenPropagated(options);
    }
}
