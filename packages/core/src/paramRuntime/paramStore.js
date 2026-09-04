import { validateParameterName } from "./paramUtils.js";

/**
 * Runtime store for scoped parameter bindings.
 *
 * Responsibilities:
 * 1. Maintain scope chain metadata (`scope -> parentScope`).
 * 2. Store local bindings (`scope + name -> ParamRef`).
 * 3. Resolve names using nearest-scope lookup through the parent chain.
 *
 * Initializers materialize pending local bindings on first lookup. Reactive
 * propagation and lifecycle ownership remain in higher-level runtime components.
 */
export default class ParamStore {
    #nextScopeId = 1;

    /**
     * @typedef {{
     *   parentScope?: string,
     *   params: Map<string, import("./types.js").ParamRef<any>>,
     *   initializers: Map<string, { initialize: () => void, initializing: boolean }>,
     *   ownerId: string
     * }} ScopeRecord
     */

    /**
     * Scope registry keyed by scope id.
     *
     * @type {Map<string, ScopeRecord>}
     */
    #scopes = new Map();

    /**
     * Creates a root scope with no parent scope.
     *
     * @param {string} ownerId
     * @returns {string}
     */
    createRootScope(ownerId) {
        const scopeId = "scope:" + this.#nextScopeId++;
        this.#scopes.set(scopeId, {
            params: new Map(),
            initializers: new Map(),
            ownerId,
        });
        return scopeId;
    }

    /**
     * Creates a child scope whose fallback resolution target is `parentScope`.
     *
     * @param {string} ownerId
     * @param {string} parentScope
     * @returns {string}
     */
    createChildScope(ownerId, parentScope) {
        if (!this.#scopes.has(parentScope)) {
            throw new Error("Unknown parent scope: " + parentScope);
        }

        const scopeId = "scope:" + this.#nextScopeId++;
        this.#scopes.set(scopeId, {
            parentScope,
            params: new Map(),
            initializers: new Map(),
            ownerId,
        });
        return scopeId;
    }

    /**
     * Returns lifecycle owner id associated with a scope.
     *
     * @param {string} scopeId
     * @returns {string}
     */
    getOwnerId(scopeId) {
        const scope = this.#scopes.get(scopeId);
        if (!scope) {
            throw new Error("Unknown scope: " + scopeId);
        }
        return scope.ownerId;
    }

    /**
     * Clears all parameter bindings from a scope while keeping the scope chain
     * metadata intact for descendants that may still resolve through it.
     *
     * @param {string} scopeId
     */
    clearScope(scopeId) {
        const scope = this.#scopes.get(scopeId);
        if (!scope) {
            throw new Error("Unknown scope: " + scopeId);
        }

        scope.params.clear();
        scope.initializers.clear();
    }

    /**
     * Reserves a local name without publishing an uninitialized value.
     * The initializer must register the real ref before returning.
     *
     * @param {string} scopeId
     * @param {string} name
     * @param {() => void} initialize
     */
    registerInitializer(scopeId, name, initialize) {
        validateParameterName(name);
        const scope = this.#scopes.get(scopeId);
        if (!scope) {
            throw new Error("Unknown scope: " + scopeId);
        }
        if (scope.params.has(name) || scope.initializers.has(name)) {
            throw new Error(
                `Parameter "${name}" already exists in scope ${scopeId}`
            );
        }
        scope.initializers.set(name, { initialize, initializing: false });
    }

    /**
     * Registers a local parameter binding into `scopeId`.
     *
     * The same parameter name can exist in parent scopes (shadowing), but
     * duplicate names are not allowed within one scope.
     *
     * @template T
     * @template {import("./types.js").ParamRef<T>} R
     * @param {string} scopeId
     * @param {string} name
     * @param {R} ref
     * @returns {R}
     */
    register(scopeId, name, ref) {
        validateParameterName(name);
        const scope = this.#scopes.get(scopeId);
        if (!scope) {
            throw new Error("Unknown scope: " + scopeId);
        }

        if (
            scope.params.has(name) ||
            scope.initializers.get(name)?.initializing === false
        ) {
            throw new Error(
                'Parameter "' + name + '" already exists in scope ' + scopeId
            );
        }

        scope.params.set(name, ref);
        return ref;
    }

    /**
     * Resolves a parameter by name from `scopeId`, searching current scope
     * first and then walking parent scopes until a match is found.
     *
     * @template T
     * @param {string} scopeId
     * @param {string} name
     * @returns {import("./types.js").ParamRef<T> | undefined}
     */
    resolve(scopeId, name) {
        validateParameterName(name);

        let currentScopeId = scopeId;
        while (currentScopeId) {
            const scope = this.#scopes.get(currentScopeId);
            if (!scope) {
                throw new Error("Unknown scope: " + currentScopeId);
            }

            const initializer = scope.initializers.get(name);
            if (initializer) {
                if (initializer.initializing) {
                    throw new Error(
                        `Parameter dependency cycle while initializing "${name}" in ${currentScopeId}.`
                    );
                }
                initializer.initializing = true;
                try {
                    initializer.initialize();
                    if (!scope.params.has(name)) {
                        throw new Error(
                            `Initializer did not register parameter "${name}".`
                        );
                    }
                    scope.initializers.delete(name);
                } finally {
                    initializer.initializing = false;
                }
            }
            const ref = scope.params.get(name);
            if (ref) {
                return /** @type {import("./types.js").ParamRef<T>} */ (ref);
            }
            currentScopeId = scope.parentScope;
        }

        return undefined;
    }
}
