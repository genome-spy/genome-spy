import {
    getViewSelector,
    resolveViewSelector,
    visitAddressableViews,
} from "@genome-spy/core/view/viewSelectors.js";

/**
 * @typedef {import("./sampleViewTypes.js").ViewRef} ViewRef
 * @typedef {import("./sampleViewTypes.js").ViewSelector} ViewSelector
 */

/**
 * Creates a selector ref for a view with an explicit name.
 *
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @returns {ViewSelector}
 */
export function createViewRef(view) {
    if (!view.explicitName) {
        throw new Error(
            "Cannot create a view reference without an explicit view name."
        );
    }

    return getViewSelector(view);
}

/**
 * Resolves a view reference to a view within the addressable tree.
 *
 * @param {import("@genome-spy/core/view/view.js").default} rootView
 * @param {ViewRef} viewRef
 * @returns {import("@genome-spy/core/view/view.js").default}
 */
export function resolveViewRef(rootView, viewRef) {
    if (typeof viewRef === "string") {
        return resolveLegacyViewRef(rootView, viewRef);
    }

    return resolveSelectorViewRef(rootView, viewRef);
}

/**
 * Returns a stable key for a view reference, or undefined if missing.
 *
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @returns {string | undefined}
 */
export function getViewRefKey(view) {
    if (!view.explicitName) {
        return;
    }

    const selector = getViewSelector(view);
    return JSON.stringify({ s: selector.scope, v: selector.view });
}

/**
 * Returns a set of unique view reference keys for an addressable tree.
 *
 * @param {import("@genome-spy/core/view/view.js").default} rootView
 * @returns {Set<string>}
 */
export function getUniqueViewRefKeys(rootView) {
    /** @type {Map<string, number>} */
    const counts = new Map();

    visitAddressableViews(rootView, (view) => {
        const key = getViewRefKey(view);
        if (!key) {
            return;
        }

        counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    /** @type {Set<string>} */
    const uniqueKeys = new Set();

    for (const [key, count] of counts) {
        if (count === 1) {
            uniqueKeys.add(key);
        }
    }

    return uniqueKeys;
}

/**
 * @param {ViewRef} viewRef
 * @returns {string}
 */
export function formatViewRef(viewRef) {
    return typeof viewRef === "string" ? viewRef : JSON.stringify(viewRef);
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} rootView
 * @param {ViewSelector} selector
 */
function resolveSelectorViewRef(rootView, selector) {
    const resolved = resolveViewSelector(rootView, selector);
    if (!resolved) {
        throw new Error(
            "Cannot resolve view selector: " + formatViewRef(selector)
        );
    }

    return resolved;
}

/**
 * @param {import("@genome-spy/core/view/view.js").default} rootView
 * @param {string} name
 */
function resolveLegacyViewRef(rootView, name) {
    /** @type {import("@genome-spy/core/view/view.js").default[]} */
    const matches = [];

    visitAddressableViews(rootView, (view) => {
        if (view.explicitName === name) {
            matches.push(view);
        }
    });

    if (matches.length === 1) {
        return matches[0];
    } else if (matches.length === 0) {
        throw new Error("Cannot find view: " + name);
    }

    throw new Error(
        'Multiple views named "' +
            name +
            '" found. Name imports or use a selector object.'
    );
}
