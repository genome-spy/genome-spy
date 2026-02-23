import {
    getImportScopeInfo,
    getViewScopeChain,
    validateSelectorConstraints as validateCoreSelectorConstraints,
    visitAddressableViews,
} from "@genome-spy/core/view/viewSelectors.js";
import { VISIT_STOP } from "@genome-spy/core/view/view.js";
import {
    isExplicitlyVisibilityConfigurable,
    isVisibilityConfigurable,
} from "./configurableVisibilityUtils.js";

/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {{ message: string, scope: string[] }} SelectorValidationIssue
 */

/**
 * Validates selector constraints with App-specific configurable-visibility rules.
 *
 * @param {View} root
 * @returns {SelectorValidationIssue[]}
 */
export function validateSelectorConstraints(root) {
    /** @type {SelectorValidationIssue[]} */
    const issues = [...validateCoreSelectorConstraints(root)];

    validateConfigurableViewNames(root, issues);
    validateConfigurableImportInstanceNames(root, issues);

    return issues;
}

/**
 * @param {View} root
 * @param {SelectorValidationIssue[]} issues
 */
function validateConfigurableViewNames(root, issues) {
    /** @type {Map<string, string[]>} */
    const scopes = new Map();
    /** @type {Map<string, Map<string, View[]>>} */
    const namesByScope = new Map();

    visitAddressableViews(root, (view) => {
        const scope = getViewScopeChain(view);
        const scopeKey = makeScopeKey(scope);
        if (!scopes.has(scopeKey)) {
            scopes.set(scopeKey, scope);
            namesByScope.set(scopeKey, new Map());
        }

        if (!isVisibilityConfigurable(view)) {
            return;
        }

        const explicitName = view.explicitName;
        if (!explicitName) {
            if (!isExplicitlyVisibilityConfigurable(view)) {
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

        const names = /** @type {Map<string, View[]>} */ (
            namesByScope.get(scopeKey)
        );
        const matches = names.get(explicitName);
        if (matches) {
            matches.push(view);
        } else {
            names.set(explicitName, [view]);
        }
    });

    for (const [scopeKey, names] of namesByScope) {
        const scope = /** @type {string[]} */ (scopes.get(scopeKey));
        for (const [name, matches] of names) {
            if (matches.length <= 1) {
                continue;
            }

            const paths = matches
                .map((view) => view.getPathString())
                .join(", ");
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
}

/**
 * @param {View} root
 * @param {SelectorValidationIssue[]} issues
 */
function validateConfigurableImportInstanceNames(root, issues) {
    /** @type {Map<string, string[]>} */
    const parentScopes = new Map();
    /** @type {Map<string, Map<string, number>>} */
    const countsByParentScope = new Map();

    visitAddressableViews(root, (view) => {
        const info = getImportScopeInfo(view);
        const importName = info ? info.name : undefined;
        if (typeof importName !== "string" || !importName.length) {
            return;
        }

        if (!hasConfigurableAddressableFeatures(view)) {
            return;
        }

        const scope = getViewScopeChain(view);
        if (!scope.length) {
            return;
        }

        const parentScope = scope.slice(0, scope.length - 1);
        const parentScopeKey = makeScopeKey(parentScope);

        if (!parentScopes.has(parentScopeKey)) {
            parentScopes.set(parentScopeKey, parentScope);
            countsByParentScope.set(parentScopeKey, new Map());
        }

        const counts = /** @type {Map<string, number>} */ (
            countsByParentScope.get(parentScopeKey)
        );
        counts.set(importName, (counts.get(importName) ?? 0) + 1);
    });

    for (const [scopeKey, counts] of countsByParentScope) {
        const scope = /** @type {string[]} */ (parentScopes.get(scopeKey));
        for (const [name, count] of counts) {
            if (count <= 1) {
                continue;
            }

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
 * @param {View} root
 * @returns {boolean}
 */
function hasConfigurableAddressableFeatures(root) {
    let found = false;

    visitAddressableViews(root, (view) => {
        if (!isVisibilityConfigurable(view)) {
            return;
        }

        if (view.explicitName || isExplicitlyVisibilityConfigurable(view)) {
            found = true;
            return VISIT_STOP;
        }
    });

    return found;
}

/**
 * @param {string[]} scope
 * @returns {string}
 */
function makeScopeKey(scope) {
    return JSON.stringify(scope);
}

/**
 * @param {string[]} scope
 * @returns {string}
 */
function formatScope(scope) {
    if (!scope.length) {
        return "import scope (root)";
    }

    return "import scope [" + scope.join(" / ") + "]";
}
