/**
 * Tracks views that are decorative chrome instead of user-authored plot views.
 *
 * Chrome views may still need inherited data, scales, or parameters, but they
 * should not participate in plot-oriented defaults such as configured
 * continuous view sizes.
 *
 * @typedef {"exclude" | "excludeSubtree"} ChromeOverride
 */

/** @type {WeakMap<import("./view.js").default, ChromeOverride>} */
const chromeOverrides = new WeakMap();

/**
 * @param {import("./view.js").default} view
 * @param {ChromeOverride} behavior
 */
export function setChromeOverride(view, behavior) {
    chromeOverrides.set(view, behavior);
}

/**
 * @param {import("./view.js").default} view
 * @returns {ChromeOverride | undefined}
 */
export function getChromeOverride(view) {
    return chromeOverrides.get(view);
}

/**
 * Returns whether a view itself has been marked as decorative chrome.
 *
 * @param {import("./view.js").default} view
 * @returns {boolean}
 */
export function isChromeView(view) {
    return chromeOverrides.has(view);
}

/**
 * Returns whether a view is inside a chrome subtree in the layout hierarchy.
 *
 * @param {import("./view.js").default} view
 * @returns {boolean}
 */
export function isInChromeSubtree(view) {
    /** @type {import("./view.js").default | null} */
    let current = view;

    while (current) {
        const behavior = chromeOverrides.get(current);
        if (behavior === "excludeSubtree") {
            return true;
        }

        if (current === view && behavior === "exclude") {
            return true;
        }

        current = current.layoutParent;
    }

    return false;
}
