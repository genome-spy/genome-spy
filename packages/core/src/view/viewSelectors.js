import { VISIT_SKIP, VISIT_STOP } from "./view.js";
import { isSelectionParameter, isVariableParameter } from "./paramMediator.js";

/**
 * @typedef {{ scope: string[], view: string }} ViewSelector
 */

/**
 * @typedef {{ scope: string[], param: string }} ParamSelector
 */

/**
 * @typedef {{ name: string | null }} ImportScopeInfo
 */

/**
 * @typedef {"exclude" | "excludeSubtree"} AddressableOverride
 */

/**
 * @typedef {{ skipSubtree?: boolean }} AddressableOptions
 */

/**
 * @typedef {{ view: import("./view.js").default, param: import("../spec/parameter.js").Parameter }} ResolvedParam
 */

/** @type {WeakMap<import("./view.js").default, ImportScopeInfo>} */
const importScopes = new WeakMap();

/** @type {WeakMap<import("./view.js").default, AddressableOverride>} */
const addressableOverrides = new WeakMap();

/**
 * Marks a view as the root of an import scope.
 *
 * @param {import("./view.js").default} view
 * @param {string | null} scopeName
 */
export function registerImportInstance(view, scopeName) {
    if (scopeName !== null && typeof scopeName !== "string") {
        throw new Error("Import scope name must be a string or null.");
    }

    importScopes.set(view, { name: scopeName });
}

/**
 * Returns import scope info for a view, if it is an import root.
 *
 * @param {import("./view.js").default} view
 * @returns {ImportScopeInfo | undefined}
 */
export function getImportScopeInfo(view) {
    return importScopes.get(view);
}

/**
 * Marks a view as non-addressable for selector resolution.
 *
 * @param {import("./view.js").default} view
 * @param {AddressableOptions} [options]
 */
export function markViewAsNonAddressable(view, options = {}) {
    const skipSubtree = options.skipSubtree ?? false;
    const behavior = skipSubtree ? "excludeSubtree" : "exclude";
    addressableOverrides.set(view, behavior);
}

/**
 * Returns the import scope chain for a view, using named import instances.
 *
 * @param {import("./view.js").default} view
 * @returns {string[]}
 */
export function getViewScopeChain(view) {
    const ancestors = view.getDataAncestors();

    /** @type {string[]} */
    const chain = [];

    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
        const info = importScopes.get(ancestors[i]);
        if (info && typeof info.name === "string") {
            chain.push(info.name);
        }
    }

    return chain;
}

/**
 * Returns a view selector for a view with an explicit name.
 *
 * @param {import("./view.js").default} view
 * @returns {ViewSelector}
 */
export function getViewSelector(view) {
    const explicitName = view.explicitName;
    if (!explicitName) {
        throw new Error("Cannot build a selector for a view without a name.");
    }

    return {
        scope: getViewScopeChain(view),
        view: explicitName,
    };
}

/**
 * Enumerates views that can be addressed by selectors.
 *
 * @param {import("./view.js").default} root
 * @returns {import("./view.js").default[]}
 */
export function getAddressableViews(root) {
    /** @type {import("./view.js").default[]} */
    const views = [];

    visitAddressableViews(root, (view) => {
        views.push(view);
    });

    return views;
}

/**
 * Visits all addressable views in the hierarchy.
 *
 * @param {import("./view.js").default} root
 * @param {import("./view.js").Visitor} visitor
 */
export function visitAddressableViews(root, visitor) {
    root.visit((view) => {
        const behavior = addressableOverrides.get(view);
        if (behavior === "excludeSubtree") {
            return VISIT_SKIP;
        }

        if (behavior === "exclude") {
            return;
        }

        return visitor(view);
    });
}

/**
 * Resolves a view selector to a unique view within the matching scope.
 *
 * @param {import("./view.js").default} root
 * @param {ViewSelector} selector
 * @returns {import("./view.js").default | undefined}
 */
export function resolveViewSelector(root, selector) {
    validateViewSelector(selector);

    const scopeRoot = resolveScopeRoot(root, selector.scope);
    if (!scopeRoot) {
        return;
    }

    /** @type {import("./view.js").default[]} */
    const matches = [];

    visitViewsInScope(
        scopeRoot,
        (view) => {
            if (view.explicitName === selector.view) {
                matches.push(view);
            }
        },
        { includeNamedImportRoots: true }
    );

    if (matches.length === 1) {
        return matches[0];
    } else if (matches.length === 0) {
        return;
    }

    throw new Error(
        'View selector is ambiguous for view "' +
            selector.view +
            '" in scope ' +
            JSON.stringify(selector.scope)
    );
}

/**
 * Resolves a parameter selector to a unique bookmarkable parameter.
 *
 * @param {import("./view.js").default} root
 * @param {ParamSelector} selector
 * @returns {ResolvedParam | undefined}
 */
export function resolveParamSelector(root, selector) {
    validateParamSelector(selector);

    const scopeRoot = resolveScopeRoot(root, selector.scope);
    if (!scopeRoot) {
        return;
    }

    /** @type {ResolvedParam[]} */
    const matches = [];

    visitViewsInScope(scopeRoot, (view) => {
        for (const [name, param] of view.paramMediator.paramConfigs) {
            if (name !== selector.param) {
                continue;
            }

            if (!isBookmarkableParam(param)) {
                continue;
            }

            matches.push({ view, param });
        }
    });

    if (matches.length === 1) {
        return matches[0];
    } else if (matches.length === 0) {
        return;
    }

    throw new Error(
        'Param selector is ambiguous for param "' +
            selector.param +
            '" in scope ' +
            JSON.stringify(selector.scope)
    );
}

/**
 * @param {ParamSelector} selector
 */
function validateParamSelector(selector) {
    if (!selector || !Array.isArray(selector.scope)) {
        throw new Error("Param selector scope must be an array.");
    }

    if (typeof selector.param !== "string" || !selector.param.length) {
        throw new Error("Param selector param must be a non-empty string.");
    }
}

/**
 * @param {ViewSelector} selector
 */
function validateViewSelector(selector) {
    if (!selector || !Array.isArray(selector.scope)) {
        throw new Error("View selector scope must be an array.");
    }

    if (typeof selector.view !== "string" || !selector.view.length) {
        throw new Error("View selector view must be a non-empty string.");
    }
}

/**
 * @param {import("../spec/parameter.js").Parameter} param
 * @returns {boolean}
 */
function isBookmarkableParam(param) {
    if (isSelectionParameter(param)) {
        return true;
    }

    if (isVariableParameter(param)) {
        return Boolean(param.bind);
    }

    return false;
}

/**
 * @param {import("./view.js").default} root
 * @param {string[]} scope
 * @returns {import("./view.js").default | undefined}
 */
function resolveScopeRoot(root, scope) {
    /** @type {import("./view.js").default} */
    let current = root;

    for (const name of scope) {
        if (typeof name !== "string" || !name.length) {
            throw new Error("Scope names must be non-empty strings.");
        }

        /** @type {import("./view.js").default | undefined} */
        let match;
        let hasDuplicate = false;

        visitViewsInScope(
            current,
            (view) => {
                const info = importScopes.get(view);
                if (info && info.name === name) {
                    if (match) {
                        hasDuplicate = true;
                        return VISIT_STOP;
                    }
                    match = view;
                }
            },
            { includeNamedImportRoots: true }
        );

        if (hasDuplicate) {
            throw new Error(
                'Multiple import instances named "' + name + '" in scope.'
            );
        }

        if (match) {
            current = match;
        } else {
            return;
        }
    }

    return current;
}

/**
 * @param {import("./view.js").default} scopeRoot
 * @param {import("./view.js").Visitor} visitor
 * @param {{ includeNamedImportRoots?: boolean }} [options]
 */
function visitViewsInScope(scopeRoot, visitor, options = {}) {
    const includeNamedImportRoots = options.includeNamedImportRoots ?? false;

    scopeRoot.visit((view) => {
        const behavior = addressableOverrides.get(view);
        if (behavior === "excludeSubtree") {
            return VISIT_SKIP;
        }

        const info = importScopes.get(view);
        const isNamedImportRoot =
            view !== scopeRoot && info && typeof info.name === "string";

        if (isNamedImportRoot) {
            if (behavior !== "exclude" && includeNamedImportRoots) {
                const result = visitor(view);
                if (result === VISIT_STOP) {
                    return result;
                }
            }

            return VISIT_SKIP;
        }

        if (behavior !== "exclude") {
            return visitor(view);
        }
    });
}
