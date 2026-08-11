import GridView, { getLegendCollectionLayoutHost } from "./gridView.js";
import {
    filterLegendResolutionOwners,
    findLegendCollectionDeclaration,
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
    const descendants = viewRoot.getDescendants();
    /** @type {Map<GridView, import("../view.js").default[]>} */
    const legendOwnersByHost = new Map();

    // Validate collection declarations even when an internal caller has
    // intentionally disabled the implicit root grid.
    for (const owner of filterLegendResolutionOwners(descendants)) {
        for (const resolution of new Set(
            Object.values(owner.resolutions.legend)
        )) {
            const declaration = findLegendCollectionDeclaration(
                owner,
                resolution.channel
            );
            const host = declaration
                ? getLegendCollectionLayoutHost(declaration, resolution.channel)
                : owner instanceof GridView
                  ? owner
                  : undefined;
            if (host) {
                const owners = legendOwnersByHost.get(host) ?? [];
                if (!owners.includes(owner)) {
                    owners.push(owner);
                    legendOwnersByHost.set(host, owners);
                }
            }
        }
    }

    const gridViews = descendants.filter((view) => view instanceof GridView);

    for (const gridView of gridViews) {
        await gridView.syncGuideViews({
            legendOwners: legendOwnersByHost.get(gridView) ?? [],
        });
    }
}
