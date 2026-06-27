import { resolveRulerBindings } from "./rulerRegistry.js";

/**
 * @typedef {{
 *     refresh: () => void,
 *     getBindings: () => import("./rulerRegistry.js").RulerBinding[]
 * }} RulerBindingStore
 */

/**
 * Creates a refreshable store for resolved ruler bindings.
 *
 * @param {import("../view/view.js").default} root
 * @returns {RulerBindingStore}
 */
export function createRulerBindingStore(root) {
    /** @type {import("./rulerRegistry.js").RulerBinding[]} */
    let bindings = [];

    const refresh = () => {
        bindings = resolveRulerBindings(root);
    };

    refresh();

    return {
        refresh,
        getBindings() {
            return bindings;
        },
    };
}
