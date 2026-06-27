import { isHConcatSpec, isVConcatSpec } from "../view/viewSpecGuards.js";

/**
 * @typedef {{
 *     type: "view"
 * } | {
 *     type: "container",
 *     channel: import("../spec/channel.js").PrimaryPositionalChannel
 * }} ResolvedRulerExtent
 */

/**
 * Resolves whether a ruler should render per view or once across its owner
 * container.
 *
 * @param {{
 *     paramName: string,
 *     requestedExtent?: import("../spec/parameter.js").RulerExtent,
 *     owner: import("../view/view.js").default,
 *     channels: import("../spec/channel.js").PrimaryPositionalChannel[],
 *     participants: import("./rulerRegistry.js").RulerParticipant[]
 * }} options
 * @returns {ResolvedRulerExtent}
 */
export function resolveRulerExtent({
    paramName,
    requestedExtent = "auto",
    owner,
    channels,
    participants,
}) {
    if (requestedExtent === "view") {
        return { type: "view" };
    }

    const channel = channels.length === 1 ? channels[0] : undefined;
    const supportsContainer =
        (channel === "x" && isVConcatSpec(owner.spec)) ||
        (channel === "y" && isHConcatSpec(owner.spec));

    if (!supportsContainer) {
        if (requestedExtent === "container") {
            throw new Error(
                `Ruler param "${paramName}" cannot use extent "container" for channel "${channel ?? "multiple"}" in this view.`
            );
        } else {
            return { type: "view" };
        }
    }

    if (!hasAlignedProjection(channel, participants)) {
        if (requestedExtent === "container") {
            throw new Error(
                `Ruler param "${paramName}" cannot use extent "container" because its ${channel} projections do not align.`
            );
        } else {
            return { type: "view" };
        }
    }

    return { type: "container", channel };
}

/**
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
 * @param {import("./rulerRegistry.js").RulerParticipant[]} participants
 */
function hasAlignedProjection(channel, participants) {
    const channelParticipants = participants.filter(
        (participant) => participant.channel === channel
    );
    const first = channelParticipants[0]?.scaleResolution;

    return (
        first !== undefined &&
        channelParticipants.every(
            (participant) => participant.scaleResolution === first
        )
    );
}
