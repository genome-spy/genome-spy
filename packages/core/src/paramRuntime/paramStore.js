/**
 * @param {string} name
 */
export function validateParamName(name) {
    if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(name)) {
        throw new Error(
            "Invalid parameter name: " +
                name +
                ". Must be a valid JavaScript identifier."
        );
    }
}

export default class ParamStore {
    #nextScopeId = 1;

    /**
     * @type {Map<string, { parentScope?: string, params: Map<string, import("./types.js").ParamRef<any>>, ownerId: string }>}
     */
    #scopes = new Map();

    /**
     * @param {string} ownerId
     */
    createRootScope(ownerId) {
        const scopeId = "scope:" + this.#nextScopeId++;
        this.#scopes.set(scopeId, { params: new Map(), ownerId });
        return scopeId;
    }

    /**
     * @param {string} ownerId
     * @param {string} parentScope
     */
    createChildScope(ownerId, parentScope) {
        if (!this.#scopes.has(parentScope)) {
            throw new Error("Unknown parent scope: " + parentScope);
        }

        const scopeId = "scope:" + this.#nextScopeId++;
        this.#scopes.set(scopeId, { parentScope, params: new Map(), ownerId });
        return scopeId;
    }

    /**
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
     * @template T
     * @template {import("./types.js").ParamRef<T>} R
     * @param {string} scopeId
     * @param {string} name
     * @param {R} ref
     * @returns {R}
     */
    register(scopeId, name, ref) {
        validateParamName(name);
        const scope = this.#scopes.get(scopeId);
        if (!scope) {
            throw new Error("Unknown scope: " + scopeId);
        }

        if (scope.params.has(name)) {
            throw new Error(
                'Parameter "' + name + '" already exists in scope ' + scopeId
            );
        }

        scope.params.set(name, ref);
        return ref;
    }

    /**
     * @template T
     * @param {string} scopeId
     * @param {string} name
     * @returns {import("./types.js").ParamRef<T> | undefined}
     */
    resolve(scopeId, name) {
        validateParamName(name);

        let currentScopeId = scopeId;
        while (currentScopeId) {
            const scope = this.#scopes.get(currentScopeId);
            if (!scope) {
                throw new Error("Unknown scope: " + currentScopeId);
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
