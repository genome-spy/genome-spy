import { VISIT_SKIP, VISIT_STOP } from "./view.js";
import { isSelectionParameter, isVariableParameter } from "./paramMediator.js";
import LayerView from "./layerView.js";

/**
 * Selectors identify views and parameters in a way that stays stable when the
 * same template/import is instantiated multiple times. They combine a chain of
 * named import instances (scope) with an explicit view or parameter name so
 * bookmarkable state and visibility toggles do not rely on globally-unique
 * names or runtime-only nodes.
 */

/**
 * @typedef {{ scope: string[], view: string }} ViewSelector
 * @typedef {{ scope: string[], param: string }} ParamSelector
 * @typedef {{ message: string, scope: string[] }} SelectorValidationIssue
 * @typedef {{ name: string | null }} ImportScopeInfo
 * @typedef {"exclude" | "excludeSubtree"} AddressableOverride
 * @typedef {{ skipSubtree?: boolean }} AddressableOptions
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
 * Validates naming and scoping constraints for addressable views and parameters.
 *
 * @param {import("./view.js").default} root
 * @returns {SelectorValidationIssue[]}
 */
export function validateSelectorConstraints(root) {
    /** @type {SelectorValidationIssue[]} */
    const issues = [];

    for (const scopeRoot of collectScopeRoots(root)) {
        const scope = getScopeChainForRoot(scopeRoot);
        validateViewNamesInScope(scopeRoot, scope, issues);
        validateParamNamesInScope(scopeRoot, scope, issues);
        validateImportInstanceNames(scopeRoot, scope, issues);
    }

    return issues;
}

/**
 * Validates the structural shape of a parameter selector.
 *
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
 * Validates the structural shape of a view selector.
 *
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
 * Returns the effective configurableVisibility value for a view.
 *
 * @param {import("./view.js").default} view
 * @returns {boolean}
 */
function isConfigurableVisibility(view) {
    const explicit = view.spec.configurableVisibility;
    if (explicit !== undefined) {
        return explicit;
    }

    return !(view.layoutParent && view.layoutParent instanceof LayerView);
}

/**
 * Returns true for parameters that are persisted in bookmarks.
 *
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
 * Collects scope roots for all named import instances and the top-level root.
 *
 * @param {import("./view.js").default} root
 * @returns {import("./view.js").default[]}
 */
function collectScopeRoots(root) {
    /** @type {Set<import("./view.js").default>} */
    const roots = new Set([root]);

    root.visit((view) => {
        const info = importScopes.get(view);
        if (info && typeof info.name === "string") {
            roots.add(view);
        }
    });

    return Array.from(roots);
}

/**
 * Builds the full scope chain for a scope root, including its own name.
 *
 * @param {import("./view.js").default} scopeRoot
 * @returns {string[]}
 */
function getScopeChainForRoot(scopeRoot) {
    const chain = getViewScopeChain(scopeRoot);
    const info = importScopes.get(scopeRoot);
    if (info && typeof info.name === "string") {
        return [...chain, info.name];
    }

    return chain;
}

/**
 * Formats a scope chain for diagnostics.
 *
 * @param {string[]} scope
 * @returns {string}
 */
function formatScope(scope) {
    if (!scope.length) {
        return "import scope (root)";
    }

    return "import scope [" + scope.join(" / ") + "]";
}

/**
 * Checks configurable view names for required explicit and unique naming.
 *
 * @param {import("./view.js").default} scopeRoot
 * @param {string[]} scope
 * @param {SelectorValidationIssue[]} issues
 */
function validateViewNamesInScope(scopeRoot, scope, issues) {
    /** @type {Map<string, import("./view.js").default[]>} */
    const names = new Map();

    visitViewsInScope(
        scopeRoot,
        (view) => {
            const explicitName = view.explicitName;
            const isConfigurable = isConfigurableVisibility(view);
            const isExplicitlyConfigurable =
                view.spec.configurableVisibility === true;

            if (!isConfigurable) {
                return;
            }

            if (!explicitName) {
                if (!isExplicitlyConfigurable) {
                    return;
                }

                issues.push({
                    message:
                        "Configurable view must have an explicit name in " +
                        formatScope(scope) +
                        ".",
                    scope,
                });
                return;
            }

            const matches = names.get(explicitName);
            if (matches) {
                matches.push(view);
            } else {
                names.set(explicitName, [view]);
            }
        },
        { includeNamedImportRoots: true }
    );

    for (const [name, matches] of names) {
        if (matches.length <= 1) {
            continue;
        }

        const paths = matches.map((view) => view.getPathString()).join(", ");

        issues.push({
            message:
                'Configurable view name "' +
                name +
                '" is not unique within ' +
                formatScope(scope) +
                ". Found in: " +
                paths +
                ".",
            scope,
        });
    }
}

/**
 * Checks bookmarkable parameter names for uniqueness within a scope.
 *
 * @param {import("./view.js").default} scopeRoot
 * @param {string[]} scope
 * @param {SelectorValidationIssue[]} issues
 */
function validateParamNamesInScope(scopeRoot, scope, issues) {
    /** @type {Map<string, import("./view.js").default[]>} */
    const names = new Map();

    visitViewsInScope(scopeRoot, (view) => {
        for (const [name, param] of view.paramMediator.paramConfigs) {
            if (!isBookmarkableParam(param)) {
                continue;
            }

            const matches = names.get(name);
            if (matches) {
                matches.push(view);
            } else {
                names.set(name, [view]);
            }
        }
    });

    for (const [name, matches] of names) {
        if (matches.length <= 1) {
            continue;
        }

        const paths = matches.map((view) => view.getPathString()).join(", ");

        issues.push({
            message:
                'Bookmarkable parameter "' +
                name +
                '" is not unique within ' +
                formatScope(scope) +
                ". Found in: " +
                paths +
                ".",
            scope,
        });
    }
}

/**
 * Ensures addressable import instances are uniquely named in a scope.
 *
 * @param {import("./view.js").default} scopeRoot
 * @param {string[]} scope
 * @param {SelectorValidationIssue[]} issues
 */
function validateImportInstanceNames(scopeRoot, scope, issues) {
    const importRoots = collectImmediateImportRoots(scopeRoot);
    if (!importRoots.length) {
        return;
    }

    const addressableRoots = importRoots.filter((view) =>
        hasAddressableFeatures(view)
    );

    if (addressableRoots.length <= 1) {
        return;
    }

    /** @type {Map<string, number>} */
    const counts = new Map();

    for (const view of addressableRoots) {
        const info = importScopes.get(view);
        const name = info ? info.name : undefined;
        if (typeof name !== "string" || !name.length) {
            continue;
        }

        counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    for (const [name, count] of counts) {
        if (count > 1) {
            issues.push({
                message:
                    'Import instance name "' +
                    name +
                    '" is used multiple times for addressable instances in ' +
                    formatScope(scope) +
                    ".",
                scope,
            });
        }
    }
}

/**
 * Collects direct import roots under a scope root.
 *
 * @param {import("./view.js").default} scopeRoot
 * @returns {import("./view.js").default[]}
 */
function collectImmediateImportRoots(scopeRoot) {
    /** @type {import("./view.js").default[]} */
    const roots = [];

    scopeRoot.visit((view) => {
        if (view === scopeRoot) {
            return;
        }

        const behavior = addressableOverrides.get(view);
        if (behavior === "excludeSubtree") {
            return VISIT_SKIP;
        }

        const info = importScopes.get(view);
        if (info) {
            roots.push(view);
            return VISIT_SKIP;
        }
    });

    return roots;
}

/**
 * Detects whether a subtree exposes configurable views or bookmarkable params.
 *
 * @param {import("./view.js").default} root
 * @returns {boolean}
 */
function hasAddressableFeatures(root) {
    let found = false;

    root.visit((view) => {
        const behavior = addressableOverrides.get(view);
        if (behavior === "excludeSubtree") {
            return VISIT_SKIP;
        }

        if (behavior !== "exclude") {
            const isConfigurable = isConfigurableVisibility(view);
            const isExplicitlyConfigurable =
                view.spec.configurableVisibility === true;

            if (
                isConfigurable &&
                (view.explicitName || isExplicitlyConfigurable)
            ) {
                found = true;
                return VISIT_STOP;
            }

            for (const param of view.paramMediator.paramConfigs.values()) {
                if (isBookmarkableParam(param)) {
                    found = true;
                    return VISIT_STOP;
                }
            }
        }
    });

    return found;
}

/**
 * Resolves a scope chain to its scope root.
 *
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
 * Visits addressable views within a scope, skipping nested named import roots.
 *
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
