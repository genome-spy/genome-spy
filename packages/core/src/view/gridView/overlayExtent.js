import { isHConcatSpec, isVConcatSpec } from "../viewSpecGuards.js";

/**
 * @typedef {"view" | "container"} OverlayExtent
 */

/**
 * Resolves whether a generated overlay should be per-view or container-spanning.
 *
 * @param {{
 *     extent?: "view" | "container" | "auto",
 *     ownerSpec: import("../../spec/view.js").ViewSpec,
 *     channels: import("../../spec/channel.js").PrimaryPositionalChannel[],
 *     isAligned: (channel: import("../../spec/channel.js").PrimaryPositionalChannel) => boolean,
 *     label: string,
 * }} options
 * @returns {OverlayExtent}
 */
export function resolveOverlayExtent({
    extent,
    ownerSpec,
    channels,
    isAligned,
    label,
}) {
    const channel = channels.length === 1 ? channels[0] : undefined;
    if (!channel) {
        return "view";
    }

    const requestsContainer = extent === "container" || extent === "auto";
    if (!requestsContainer) {
        return "view";
    }

    const supportsContainer =
        (channel === "x" && isVConcatSpec(ownerSpec)) ||
        (channel === "y" && isHConcatSpec(ownerSpec));

    if (!supportsContainer) {
        if (extent === "container") {
            throw new Error(
                `${label} cannot use extent "container" for channel "${channel}" in this view.`
            );
        } else {
            return "view";
        }
    }

    if (!isAligned(channel)) {
        if (extent === "container") {
            throw new Error(
                `${label} cannot use extent "container" because its ${channel} projections do not align.`
            );
        } else {
            return "view";
        }
    }

    return "container";
}
