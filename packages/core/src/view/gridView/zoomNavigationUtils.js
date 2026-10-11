import LayerView from "../layerView.js";
import UnitView from "../unitView.js";
import { isFacetSpec } from "../viewSpecGuards.js";

/**
 * @typedef {import("../view.js").default} View
 */

/**
 * @param {View} view
 * @param {import("../layout/point.js").default} point
 * @param {import("../layout/rectangle.js").default} [coords]
 */
export function getZoomInteractionTarget(view, point, coords) {
    if (isFacetSpec(view.spec)) {
        const facet = /** @type {import("../facetView.js").default} */ (view);
        const facetCoords = facet.getZoomCoords(point);
        return facetCoords
            ? { view: facet.child, coords: facetCoords }
            : undefined;
    } else if (view instanceof UnitView || view instanceof LayerView) {
        return { view, coords };
    }
}

/**
 * Finds all zoomable positional resolutions in a subtree.
 *
 * @param {View} view
 * @returns {Record<import("../../spec/channel.js").PrimaryPositionalChannel, Set<import("../../scales/scaleResolution.js").default>>}
 */
export function getZoomableResolutions(view) {
    /** @type {Record<import("../../spec/channel.js").PrimaryPositionalChannel, Set<import("../../scales/scaleResolution.js").default>>} */
    const resolutions = {
        x: new Set(),
        y: new Set(),
    };

    // Find all resolutions (scales) that are candidates for zooming
    view.visit((v) => {
        for (const [channel, resolutionSet] of Object.entries(resolutions)) {
            const resolution = v.getScaleResolution(channel);
            if (resolution && resolution.isZoomable()) {
                resolutionSet.add(resolution);
            }
        }
    });

    return resolutions;
}

/**
 * Returns the keyboard zoom target when exactly one zoomable x-resolution is
 * present in the hierarchy and it is resolved to the root view.
 *
 * @param {View} viewRoot
 */
export function getKeyboardZoomTarget(viewRoot) {
    const xResolutions = getZoomableResolutions(viewRoot).x;
    if (xResolutions.size !== 1) {
        return;
    } else {
        const target = xResolutions.values().next().value;
        const rootXResolution = viewRoot.getScaleResolution("x");

        if (!rootXResolution || rootXResolution !== target) {
            return;
        } else {
            return target;
        }
    }
}
