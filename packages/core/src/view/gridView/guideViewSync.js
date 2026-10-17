import { getLegendLayoutHost } from "./gridView.js";
import { filterLegendResolutionOwners } from "./legendCollection.js";
import ContainerView from "../containerView.js";
import { attachViewLevelScaleProps } from "../../scales/viewLevelScaleProps.js";
import {
    attachViewLevelAxisProps,
    attachViewLevelLegendProps,
} from "../../scales/viewLevelGuideProps.js";
import { ensureAssembliesForView } from "../../genome/assemblyPreflight.js";

/**
 * Completes startup guide preparation after constructing the authored hierarchy.
 * Properties and assemblies must be ready before generated views can read scales.
 *
 * @param {import("../view.js").default} viewRoot
 */
export async function initializeViewGuides(viewRoot) {
    attachViewLevelScaleProps(viewRoot);
    attachViewLevelAxisProps(viewRoot);
    attachViewLevelLegendProps(viewRoot);
    await ensureAssembliesForView(viewRoot, viewRoot.context.genomeStore);
    await syncViewGuideViews(viewRoot);
}

/**
 * Creates or refreshes guide hosts whose properties and assemblies are ready.
 * @param {import("../view.js").default} viewRoot
 */
export async function syncViewGuideViews(viewRoot) {
    const descendants = viewRoot.getDescendants();
    /** @type {Map<ContainerView, import("../view.js").default[]>} */
    const legendOwnersByHost = new Map();

    // Validate collection declarations even when an internal caller has
    // intentionally disabled the implicit root grid.
    for (const owner of filterLegendResolutionOwners(descendants)) {
        for (const resolution of new Set(
            Object.values(owner.resolutions.legend)
        )) {
            const host = getLegendLayoutHost(owner, resolution.channel);
            if (host) {
                const owners = legendOwnersByHost.get(host) ?? [];
                if (!owners.includes(owner)) {
                    owners.push(owner);
                    legendOwnersByHost.set(host, owners);
                }
            }
        }
    }

    for (const view of descendants) {
        if (view instanceof ContainerView) {
            await view.syncGuideViews({
                legendOwners: legendOwnersByHost.get(view) ?? [],
            });
        }
    }
}
