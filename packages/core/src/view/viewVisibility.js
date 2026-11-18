import { resolveViewSelector } from "./viewSelectors.js";

/**
 * @param {import("./view.js").default} root
 * @param {readonly import("../types/embedApi.js").ViewVisibilityOverride[]} overrides
 */
export function resolveVisibilityOverrides(root, overrides) {
    /** @type {Map<import("./view.js").default, boolean>} */
    const choices = new Map();
    for (const entry of overrides) {
        const view = resolveViewSelector(root, entry, true);
        if (view && !view.visibilityIsExpression) {
            choices.set(view, entry.visible);
        }
    }
    return choices;
}
