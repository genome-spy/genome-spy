import {
    getBookmarkableParams,
    getViewScopeChain,
    visitAddressableViews,
} from "@genome-spy/core/view/viewSelectors.js";

/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} ParamSelector
 */

/**
 * Prefixes a view label with import scope when the view name is ambiguous.
 *
 * @param {View | undefined} root
 * @param {View} view
 * @param {string} label
 * @returns {string}
 */
export function formatScopedViewLabel(root, view, label) {
    if (!isViewNameAmbiguous(root, view)) {
        return label;
    }

    const scope = getSafeViewScopeChain(view);
    if (!scope.length) {
        return label;
    }

    return scope.join("/") + "/" + label;
}

/**
 * Prefixes a parameter name with import scope when the name is ambiguous.
 *
 * @param {View | undefined} root
 * @param {ParamSelector} selector
 * @returns {string}
 */
export function formatScopedParamName(root, selector) {
    if (!isParamNameAmbiguous(root, selector.param)) {
        return selector.param;
    }

    if (!Array.isArray(selector.scope) || selector.scope.length === 0) {
        return selector.param;
    }

    return selector.scope.join("/") + "/" + selector.param;
}

/**
 * @param {View | undefined} root
 * @param {View} view
 * @returns {boolean}
 */
function isViewNameAmbiguous(root, view) {
    if (!root || typeof root.visit !== "function") {
        return false;
    }

    const explicitName = view.explicitName;
    if (typeof explicitName !== "string" || explicitName.length === 0) {
        return false;
    }

    let count = 0;
    visitAddressableViews(root, (candidate) => {
        if (candidate.explicitName === explicitName) {
            count += 1;
        }
    });

    return count > 1;
}

/**
 * @param {View | undefined} root
 * @param {string} paramName
 * @returns {boolean}
 */
function isParamNameAmbiguous(root, paramName) {
    if (!root || typeof root.visit !== "function") {
        return false;
    }

    let count = 0;
    for (const entry of getBookmarkableParams(root)) {
        if (entry.selector.param === paramName) {
            count += 1;
        }
    }

    return count > 1;
}

/**
 * @param {View} view
 * @returns {string[]}
 */
function getSafeViewScopeChain(view) {
    try {
        return getViewScopeChain(view);
    } catch {
        return [];
    }
}
