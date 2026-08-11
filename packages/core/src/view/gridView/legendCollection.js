import GridView from "./gridView.js";
import { hasChromeAncestor } from "../viewSelectors.js";

/**
 * Returns semantic legend-resolution owners in deterministic hierarchy order.
 * Generated chrome is omitted because it must never contribute user legends.
 *
 * @param {import("../view.js").default} viewRoot
 */
export function getLegendResolutionOwners(viewRoot) {
    return viewRoot
        .getDescendants()
        .filter(
            (view) =>
                !hasChromeAncestor(view) &&
                Object.keys(view.resolutions.legend).length > 0
        );
}

/**
 * Finds the grid that collects a legend while leaving its semantic resolution
 * at the original owner. The nearest explicit collection declaration wins and
 * an excluded declaration blocks collection by outer ancestors.
 *
 * @param {import("../view.js").default} resolutionOwner
 * @param {import("../../spec/channel.js").ChannelWithScale} channel
 * @returns {GridView | undefined}
 */
export function findLegendCollectionTarget(resolutionOwner, channel) {
    for (const view of resolutionOwner.getDataAncestors()) {
        const behavior =
            view.getConfiguredResolution(channel, "legend") ??
            view.getConfiguredResolution("default", "legend");

        if (behavior == "excluded") {
            return undefined;
        } else if (behavior == "collected") {
            const host = view
                .getLayoutAncestors()
                .find((ancestor) => ancestor instanceof GridView);
            if (!host) {
                throw new Error(
                    `Legend collection for channel "${channel}" declared at view "${view.name}" requires a GridView layout host.`
                );
            }
            return host;
        }
    }

    return undefined;
}
