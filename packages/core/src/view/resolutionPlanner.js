import ScaleResolution from "../scales/scaleResolution.js";
import AxisResolution from "../scales/axisResolution.js";
import LegendResolution from "../scales/legendResolution.js";
import {
    isPositionalChannel,
    findChannelDefWithScale,
    getPrimaryChannel,
    isChannelWithScale,
    isPrimaryPositionalChannel,
    isOffsetChannel,
} from "../encoder/encoder.js";
import { isInChromeSubtree } from "./viewChrome.js";

/**
 * @typedef {object} ResolutionMember
 * @prop {import("./unitView.js").default} view
 * @prop {import("../spec/channel.js").Channel} channel
 * @prop {import("../spec/channel.js").ChannelDefWithScale} channelDef
 * @prop {import("../spec/channel.js").ChannelWithScale} targetChannel
 */

/**
 * @typedef {Map<import("../scales/scaleResolution.js").default, ResolutionMember[]>} ScaleResolutionMemberMap
 * @typedef {import("../spec/view.js").ResolutionTarget} ResolutionPlannerTarget
 */

/**
 * @param {import("./unitView.js").default} view
 * @param {ResolutionPlannerTarget} type
 * @param {import("../spec/channel.js").ChannelWithScale} targetChannel
 * @returns {import("./unitView.js").default}
 */
const getResolutionView = (view, type, targetChannel) => {
    let resolutionView = view;
    while (
        (getResolutionBehavior(resolutionView, type, targetChannel) ==
            "forced" ||
            (resolutionView.dataParent &&
                ["shared", "excluded", "forced"].includes(
                    getResolutionBehavior(
                        resolutionView.dataParent,
                        type,
                        targetChannel
                    )
                ))) &&
        getResolutionBehavior(resolutionView, type, targetChannel) != "excluded"
    ) {
        // @ts-ignore
        resolutionView = resolutionView.dataParent;
    }

    return resolutionView;
};

/**
 * @param {import("./view.js").default} view
 * @param {ResolutionPlannerTarget} type
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @returns {import("../spec/view.js").ResolutionBehavior}
 */
function getResolutionBehavior(view, type, channel) {
    const behavior = view.getConfiguredOrDefaultResolution(channel, type);

    switch (behavior) {
        case "independent":
        case "shared":
        case "excluded":
        case "forced":
            return behavior;
        case "collected":
            if (type == "legend") {
                // Collection controls physical placement only. Preserve the
                // normal legend topology by following the scale resolution.
                return getResolutionBehavior(view, "scale", channel);
            } else {
                throw new Error(
                    `Resolution behavior "collected" is only supported for legends, not ${type}s.`
                );
            }
        default:
            throw new Error(`Unknown ${type} resolution behavior: ${behavior}`);
    }
}

/**
 * @param {import("./unitView.js").default} ownerView
 * @param {import("./unitView.js").default} resolutionView
 * @param {import("../spec/channel.js").ChannelWithScale} targetChannel
 * @returns {import("../scales/scaleResolution.js").default}
 */
const ensureScaleResolution = (ownerView, resolutionView, targetChannel) => {
    if (!resolutionView.resolutions.scale[targetChannel]) {
        const resolution = new ScaleResolution(targetChannel, resolutionView);
        resolutionView.resolutions.scale[targetChannel] = resolution;
    }

    return resolutionView.resolutions.scale[targetChannel];
};

/**
 * @param {import("./unitView.js").default} view
 * @param {ResolutionPlannerTarget} type
 * @param {import("../spec/channel.js").Channel} channel
 * @param {unknown} channelDef
 * @returns {ResolutionMember | undefined}
 */
const getResolutionMember = (view, type, channel, channelDef) => {
    const channelDefWithScale = findChannelDefWithScale(channelDef);
    if (!channelDefWithScale) {
        return undefined;
    }

    const targetChannel = getPrimaryChannel(
        channelDefWithScale.resolutionChannel ?? channel
    );
    if (!isChannelWithScale(targetChannel)) {
        return undefined;
    }

    if (type == "axis" && !isPositionalChannel(targetChannel)) {
        return undefined;
    }
    if (
        type == "legend" &&
        (isPositionalChannel(targetChannel) || isOffsetChannel(targetChannel))
    ) {
        return undefined;
    }
    if (
        type == "legend" &&
        getResolutionBehavior(view, type, targetChannel) == "excluded" &&
        isInChromeSubtree(view)
    ) {
        return undefined;
    }

    return {
        view: getResolutionView(view, type, targetChannel),
        channel,
        channelDef: channelDefWithScale,
        targetChannel,
    };
};

/**
 * @param {import("./unitView.js").default} view
 * @param {(channel: import("../spec/channel.js").Channel, channelDef: unknown) => void} callback
 */
const forEachEncodedChannel = (view, callback) => {
    for (const [channel, channelDef] of Object.entries(view.mark.encoding)) {
        if (!channelDef || Array.isArray(channelDef)) {
            continue;
        }

        callback(
            /** @type {import("../spec/channel.js").Channel} */ (channel),
            channelDef
        );
    }
};

/**
 * @param {import("./unitView.js").default} view
 * @returns {ResolutionMember[]}
 */
const collectAxisResolutionMembers = (view) => {
    /** @type {ResolutionMember[]} */
    const axisMembers = [];
    forEachEncodedChannel(view, (channel, channelDef) => {
        const member = getResolutionMember(view, "axis", channel, channelDef);
        if (member && isPositionalChannel(member.channel)) {
            axisMembers.push(member);
        }
    });

    return axisMembers;
};

/**
 * @param {import("./unitView.js").default} view
 * @returns {ResolutionMember[]}
 */
const collectLegendResolutionMembers = (view) => {
    /** @type {ResolutionMember[]} */
    const legendMembers = [];
    for (const [channel, channelDef] of Object.entries(view.getEncoding())) {
        if (!channelDef || Array.isArray(channelDef)) {
            continue;
        }

        const member = getResolutionMember(view, "legend", channel, channelDef);
        if (member && !isPositionalChannel(member.channel)) {
            legendMembers.push(member);
        }
    }

    return legendMembers;
};

/**
 * @param {import("./unitView.js").default} view
 * @returns {ScaleResolutionMemberMap}
 */
const collectScaleResolutionMembers = (view) => {
    /** @type {ScaleResolutionMemberMap} */
    const scaleMembersByResolution = new Map();

    forEachEncodedChannel(view, (channel, channelDef) => {
        const member = getResolutionMember(view, "scale", channel, channelDef);
        if (!member) {
            return;
        }

        const resolution = ensureScaleResolution(
            view,
            member.view,
            member.targetChannel
        );
        const members = scaleMembersByResolution.get(resolution);
        if (members) {
            members.push(member);
        } else {
            scaleMembersByResolution.set(resolution, [member]);
        }
    });

    return scaleMembersByResolution;
};

/**
 * @param {import("./unitView.js").default} view
 * @param {ResolutionMember[]} axisMembers
 */
const registerAxisResolutionMembers = (view, axisMembers) => {
    for (const {
        view: resolutionView,
        channel,
        channelDef,
        targetChannel,
    } of axisMembers) {
        if (
            !isPositionalChannel(channel) ||
            !isPrimaryPositionalChannel(targetChannel)
        ) {
            continue;
        }

        if (!resolutionView.resolutions.axis[targetChannel]) {
            resolutionView.resolutions.axis[targetChannel] = new AxisResolution(
                targetChannel
            );
        }
        const resolution = resolutionView.resolutions.axis[targetChannel];
        const unregister = resolution.registerMember({
            view,
            channel,
            channelDef,
        });
        view.registerDisposer(() => {
            if (
                unregister() &&
                resolutionView.resolutions.axis[targetChannel] === resolution
            ) {
                delete resolutionView.resolutions.axis[targetChannel];
            }
        });
    }
};

/**
 * @param {import("./unitView.js").default} view
 * @param {ResolutionMember[]} legendMembers
 */
const registerLegendResolutionMembers = (view, legendMembers) => {
    for (const {
        view: resolutionView,
        channel,
        targetChannel,
    } of legendMembers) {
        if (isPositionalChannel(channel)) {
            continue;
        }

        const legendChannel =
            /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                targetChannel
            );
        if (!resolutionView.resolutions.legend[legendChannel]) {
            resolutionView.resolutions.legend[legendChannel] =
                new LegendResolution(legendChannel);
        }

        const resolution = resolutionView.resolutions.legend[legendChannel];
        const unregister = resolution.registerMember({
            view,
            channel:
                /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                    channel
                ),
        });
        view.registerDisposer(() => {
            if (
                unregister() &&
                resolutionView.resolutions.legend[legendChannel] === resolution
            ) {
                delete resolutionView.resolutions.legend[legendChannel];
            }
        });
    }
};

/**
 * @param {import("./unitView.js").default} view
 * @param {ScaleResolutionMemberMap} scaleMembersByResolution
 */
const registerScaleResolutionMembers = (view, scaleMembersByResolution) => {
    ScaleResolution.registerInBatch(scaleMembersByResolution.keys(), () => {
        for (const [resolution, members] of scaleMembersByResolution) {
            for (const {
                view: resolutionView,
                channel,
                channelDef,
                targetChannel,
            } of members) {
                const scaleChannel =
                    /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                        targetChannel
                    );

                const contributesToDomain = !view.isDomainInert();

                const unregister = resolution.registerMember({
                    view,
                    channel:
                        /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                            channel
                        ),
                    channelDef,
                    contributesToDomain,
                });
                view.registerDisposer(() => {
                    if (
                        unregister() &&
                        resolutionView.resolutions.scale[scaleChannel] ===
                            resolution
                    ) {
                        resolution.dispose();
                        delete resolutionView.resolutions.scale[scaleChannel];
                    }
                });
            }
        }
    });
};

/**
 * Resolves scale and axis members for a view.
 *
 * @param {import("./unitView.js").default} view
 * @param {ResolutionPlannerTarget} [type]
 */
export const resolveViewResolutions = (view, type) => {
    if (!type) {
        resolveViewResolutions(view, "scale");
        resolveViewResolutions(view, "axis");
        return;
    }

    if (type == "axis") {
        registerAxisResolutionMembers(view, collectAxisResolutionMembers(view));
    } else if (type == "legend") {
        registerLegendResolutionMembers(
            view,
            collectLegendResolutionMembers(view)
        );
    } else {
        registerScaleResolutionMembers(
            view,
            collectScaleResolutionMembers(view)
        );
    }
};
