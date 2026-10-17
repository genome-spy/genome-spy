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
    if (extent === "view") {
        return "view";
    }

    const channel = channels[0];
    const supportsContainer =
        (channel === "x" && isVConcatSpec(ownerSpec)) ||
        (channel === "y" && isHConcatSpec(ownerSpec));
    let reason;

    if (channels.length !== 1) {
        reason = "for multiple channels";
    } else if (!supportsContainer) {
        reason = `for channel "${channel}" in this view`;
    } else if (!isAligned(channel)) {
        reason = `because its ${channel} projections do not align`;
    }

    if (reason && extent === "container") {
        throw new Error(`${label} cannot use extent "container" ${reason}.`);
    }

    return reason ? "view" : "container";
}
