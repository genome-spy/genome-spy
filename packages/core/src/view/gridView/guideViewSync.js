import GridView from "./gridView.js";
import {
    getHierarchyLegendOwners,
    getOrderedLegendEntries,
} from "./gridChildLegends.js";

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
    const requestsRootPlacement = getOrderedLegendEntries(
        getHierarchyLegendOwners(viewRoot)
    ).some(
        ({ definition }) => (definition.legend.placement ?? "local") === "root"
    );
    if (requestsRootPlacement && !(viewRoot instanceof GridView)) {
        throw new Error(
            'Legend placement "root" requires an effective root GridView. Enable implicit root wrapping or use a concat root.'
        );
    }

    const gridViews = viewRoot
        .getDescendants()
        .filter((view) => view instanceof GridView);

    for (const gridView of gridViews) {
        // The root collector is included in gridViews and synchronizes its
        // legends once. Nested grids must not repeatedly rebuild it.
        await gridView.syncGuideViews({ bubbleRootLegends: false });
    }
}
