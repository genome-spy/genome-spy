import GraphRuntime from "./graphRuntime.js";
import LifecycleRegistry from "./lifecycleRegistry.js";
import ParamStore from "./paramStore.js";
import { compileExpression } from "./expressionCompiler.js";

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
     * @returns {import("./types.js").WritableParamRef<T>}
     */
    registerBase(scope, name, initial) {
        const ownerId = this.#paramStore.getOwnerId(scope);
        const ref = this.#graphRuntime.createWritable(
            ownerId,
            name,
            "base",
            initial
        );
        return this.#paramStore.register(scope, name, ref);
    }

    /**
     * @template T
     * @param {string} scope
     * @param {string} name
     * @param {T} initial
     * @returns {import("./types.js").WritableParamRef<T>}
     */
    registerSelection(scope, name, initial) {
        const ownerId = this.#paramStore.getOwnerId(scope);
        const ref = this.#graphRuntime.createWritable(
            ownerId,
            name,
            "selection",
            initial
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
        const globalObject = {};
        const compiled = compileExpression(expr, globalObject);
        const deps = compiled.globals.map((globalName) => {
            const resolved = this.resolve(scope, globalName);
            if (!resolved) {
                throw new Error(
                    'Unknown variable "' + globalName + '" in expression: ' + expr
                );
            }
            return resolved;
        });

        for (let i = 0; i < compiled.globals.length; i++) {
            const globalName = compiled.globals[i];
            const dep = deps[i];

            Object.defineProperty(globalObject, globalName, {
                enumerable: true,
                get() {
                    return dep.get();
                },
            });
        }

        const ownerId = this.#paramStore.getOwnerId(scope);
        const ref = this.#graphRuntime.computed(ownerId, name, deps, () =>
            compiled(null)
        );
        return this.#paramStore.register(scope, name, ref);
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
