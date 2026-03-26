import ScaleResolution from "../scales/scaleResolution.js";
import AxisResolution from "../scales/axisResolution.js";
import {
    isPositionalChannel,
    isChannelDefWithScale,
    getPrimaryChannel,
    isChannelWithScale,
    isPrimaryPositionalChannel,
    isValueDefWithCondition,
} from "../encoder/encoder.js";

/**
 * @typedef {object} ResolutionMember
 * @prop {import("./unitView.js").default} view
 * @prop {import("../spec/channel.js").Channel} channel
 * @prop {import("../spec/channel.js").ChannelDefWithScale} channelDef
 * @prop {import("../spec/channel.js").ChannelWithScale} targetChannel
 */

/**
 * @typedef {Map<import("../scales/scaleResolution.js").default, ResolutionMember[]>} ScaleResolutionMemberMap
 */

/**
 * @param {unknown} channelDef
 * @returns {import("../spec/channel.js").ChannelDefWithScale | undefined}
 */
const getChannelDefWithScale = (channelDef) => {
    if (isChannelDefWithScale(channelDef)) {
        return channelDef;
    }

    if (isValueDefWithCondition(channelDef)) {
        const condition = channelDef.condition;
        if (!Array.isArray(condition) && isChannelDefWithScale(condition)) {
            return condition;
        }
    }

    return undefined;
};

/**
 * @param {import("./unitView.js").default} view
 * @param {import("../spec/view.js").ResolutionTarget} type
 * @param {import("../spec/channel.js").ChannelWithScale} targetChannel
 * @returns {import("./unitView.js").default}
 */
const getResolutionView = (view, type, targetChannel) => {
    let resolutionView = view;
    while (
        (resolutionView.getConfiguredOrDefaultResolution(targetChannel, type) ==
            "forced" ||
            (resolutionView.dataParent &&
                ["shared", "excluded", "forced"].includes(
                    resolutionView.dataParent.getConfiguredOrDefaultResolution(
                        targetChannel,
                        type
                    )
                ))) &&
        resolutionView.getConfiguredOrDefaultResolution(targetChannel, type) !=
            "excluded"
    ) {
        // @ts-ignore
        resolutionView = resolutionView.dataParent;
    }

    return resolutionView;
};

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

        const updateRangeTexture = (
            /** @type {import("../types/scaleResolutionApi.js").ScaleResolutionEvent} */ event
        ) => {
            ownerView.context.glHelper?.createRangeTexture(
                event.scaleResolution,
                true
            );
        };
        resolution.addEventListener("range", updateRangeTexture);
        resolution.addEventListener("domain", updateRangeTexture);
        ownerView.registerDisposer(() => {
            resolution.removeEventListener("range", updateRangeTexture);
            resolution.removeEventListener("domain", updateRangeTexture);
        });
    }

    return resolutionView.resolutions.scale[targetChannel];
};

/**
 * @param {import("./unitView.js").default} view
 * @param {import("../spec/view.js").ResolutionTarget} type
 * @param {import("../spec/channel.js").Channel} channel
 * @param {unknown} channelDef
 * @returns {ResolutionMember | undefined}
 */
const getResolutionMember = (view, type, channel, channelDef) => {
    const channelDefWithScale = getChannelDefWithScale(channelDef);
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

    return {
        view: getResolutionView(view, type, targetChannel),
        channel,
        channelDef: channelDefWithScale,
        targetChannel,
    };
};

/**
 * @param {import("./unitView.js").default} view
 * @returns {ResolutionMember[]}
 */
const collectAxisResolutionMembers = (view) => {
    /** @type {ResolutionMember[]} */
    const axisMembers = [];
    for (const [channel, channelDef] of Object.entries(view.mark.encoding)) {
        if (!channelDef || Array.isArray(channelDef)) {
            continue;
        }

        const member = getResolutionMember(view, "axis", channel, channelDef);
        if (member && isPositionalChannel(member.channel)) {
            axisMembers.push(member);
        }
    }

    return axisMembers;
};

/**
 * @param {import("./unitView.js").default} view
 * @returns {ScaleResolutionMemberMap}
 */
const collectScaleResolutionMembers = (view) => {
    /** @type {ScaleResolutionMemberMap} */
    const scaleMembersByResolution = new Map();

    for (const [channel, channelDef] of Object.entries(view.mark.encoding)) {
        if (!channelDef || Array.isArray(channelDef)) {
            continue;
        }

        const member = getResolutionMember(view, "scale", channel, channelDef);
        if (!member) {
            continue;
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
    }

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
 * @param {import("../spec/view.js").ResolutionTarget} [type]
 */
export const resolveViewResolutions = (view, type) => {
    if (!type) {
        resolveViewResolutions(view, "scale");
        resolveViewResolutions(view, "axis");
        return;
    }

    if (type == "axis") {
        registerAxisResolutionMembers(view, collectAxisResolutionMembers(view));
    } else {
        registerScaleResolutionMembers(
            view,
            collectScaleResolutionMembers(view)
        );
    }
};
