import LayerView from "../layerView.js";
import {
    markViewAsChrome,
    markViewAsNonAddressable,
} from "../viewSelectors.js";

/**
 * @typedef {{ view: LayerView, zindex: number }} GeneratedChromeOverlay
 */

/**
 * Marks a generated overlay view as decorative and non-addressable chrome.
 *
 * @param {import("../view.js").default} view
 */
function markGeneratedChromeOverlay(view) {
    markViewAsNonAddressable(view, { skipSubtree: true });
    markViewAsChrome(view, { skipSubtree: true });
}

/**
 * Creates a generated chrome layer view from an already-built layer spec.
 *
 * @param {{
 *     spec: import("../../spec/view.js").LayerSpec,
 *     context: import("../../types/viewContext.js").default,
 *     layoutParent: import("../containerView.js").default,
 *     dataParent: import("../view.js").default,
 *     name: string,
 *     zindex?: number,
 * }} options
 * @returns {GeneratedChromeOverlay}
 */
export function createGeneratedChromeOverlay({
    spec,
    context,
    layoutParent,
    dataParent,
    name,
    zindex = 1,
}) {
    const view = new LayerView(spec, context, layoutParent, dataParent, name);
    markGeneratedChromeOverlay(view);

    return { view, zindex };
}
