import GridView from "./gridView.js";
import {
    findLegendCollectionTarget,
    getLegendResolutionOwners,
} from "./legendCollection.js";

/**
 * Recreates guide views after resolution-level properties have been attached.
 *
 * Concat views initially materialize guides while their child hierarchies are
 * being created. View-level axis and legend properties can only be mapped after
 * the full resolution hierarchy exists, so every grid view must refresh its
 * guides once mapping is complete.
 *
 * @param {import("../view.js").default} viewRoot
 */
export async function syncViewGuideViews(viewRoot) {
    // Validate collection declarations even when an internal caller has
    // intentionally disabled the implicit root grid.
    for (const owner of getLegendResolutionOwners(viewRoot)) {
        for (const resolution of Object.values(owner.resolutions.legend)) {
            findLegendCollectionTarget(owner, resolution.channel);
        }
    }

    const gridViews = viewRoot
        .getDescendants()
        .filter((view) => view instanceof GridView);

    for (const gridView of gridViews) {
        await gridView.syncGuideViews();
    }
}
