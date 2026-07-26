/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {"current" | "incoming" | "conflict"} ViewLevelConfigPrecedence
 */

/**
 * Resolves exclusive view-level config ownership between two views.
 *
 * An ancestor config owns the whole shared resolution and shadows descendant
 * configs. Unrelated views cannot both configure the same resolution.
 *
 * @param {View} currentView
 * @param {View} incomingView
 * @returns {ViewLevelConfigPrecedence}
 */
export function getViewLevelConfigPrecedence(currentView, incomingView) {
    if (
        currentView === incomingView ||
        currentView.getDataAncestors().includes(incomingView)
    ) {
        return "incoming";
    } else if (incomingView.getDataAncestors().includes(currentView)) {
        return "current";
    } else {
        return "conflict";
    }
}
