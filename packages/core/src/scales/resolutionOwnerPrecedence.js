/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {"current" | "incoming" | "conflict"} ResolutionOwnerPrecedence
 */

/**
 * Resolves exclusive resolution ownership between two views.
 *
 * An ancestor declaration owns the whole shared resolution and shadows
 * descendant declarations. Unrelated views cannot both own the resolution.
 *
 * @param {View} currentView
 * @param {View} incomingView
 * @returns {ResolutionOwnerPrecedence}
 */
export function getResolutionOwnerPrecedence(currentView, incomingView) {
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
