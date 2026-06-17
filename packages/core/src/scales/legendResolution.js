import {
    findChannelDefWithScale,
    isColorChannel,
    isFieldDef,
    isValueDef,
} from "../encoder/encoder.js";
import { getConfiguredLegendDefaults } from "../config/legendConfig.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import { orderResolutionMembers } from "./resolutionMemberOrder.js";
import { isChromeView } from "../view/viewSelectors.js";

/**
 * @typedef {"symbol" | "gradient"} LegendType
 * @typedef {object} LegendResolutionMember
 * @prop {import("../view/unitView.js").default} view
 * @prop {import("../spec/channel.js").ChannelWithScale} channel
 *
 * @typedef {{
 *     channel: import("../spec/channel.js").ChannelWithScale,
 *     type: LegendType,
 *     symbolChannels?: Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>,
 *     legend: import("../spec/legend.js").LegendConfig,
 *     format?: string,
 *     dataType: import("../spec/channel.js").Type,
 *     scaleResolution: import("./scaleResolution.js").default
 * }} LegendDefinition
 */

const SYMBOL_LEGEND_CHANNELS = new Set([
    "color",
    "fill",
    "stroke",
    "shape",
    "size",
]);
const GRADIENT_LEGEND_CHANNELS = new Set(["color", "fill", "stroke"]);

export default class LegendResolution {
    /** @type {Set<LegendResolutionMember>} */
    #members = new Set();

    /**
     * @param {import("../spec/channel.js").ChannelWithScale} channel
     */
    constructor(channel) {
        this.channel = channel;
    }

    /**
     * @param {LegendResolutionMember} member
     * @returns {() => boolean}
     */
    registerMember(member) {
        this.#members.add(member);
        return () => this.removeMember(member) && this.#members.size === 0;
    }

    /**
     * @param {LegendResolutionMember} member
     * @returns {boolean}
     */
    removeMember(member) {
        return this.#members.delete(member);
    }

    /**
     * @returns {LegendDefinition[]}
     */
    getLegendDefs() {
        return orderResolutionMembers(this.#members)
            .map((member) =>
                createLegendDefinition(member.channel, member.view)
            )
            .filter((definition) => definition !== undefined);
    }

    /**
     * @returns {boolean}
     */
    hasVisibleNonChromeMember() {
        for (const member of this.#members) {
            if (
                member.view.isVisible() &&
                !member.view.getLayoutAncestors().some(isChromeView)
            ) {
                return true;
            }
        }

        return false;
    }
}

/**
 * Classifies currently implemented legend support. Deferred and unsupported
 * channels intentionally return undefined so accidental legends are not
 * generated before their visual representation is designed.
 *
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @param {import("../spec/channel.js").ChannelDefWithScale} channelDef
 * @returns {LegendType | undefined}
 */
export function getLegendType(channel, channelDef) {
    if (channel == "size" && channelDef.type == "quantitative") {
        return "symbol";
    } else if (
        (channelDef.type === "nominal" || channelDef.type === "ordinal") &&
        SYMBOL_LEGEND_CHANNELS.has(channel)
    ) {
        return "symbol";
    } else if (
        channelDef.type === "quantitative" &&
        GRADIENT_LEGEND_CHANNELS.has(channel)
    ) {
        return "gradient";
    } else {
        return undefined;
    }
}

/**
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @param {import("../view/unitView.js").default} legendParent
 * @returns {import("../spec/channel.js").ChannelDefWithScale | undefined}
 */
function getLegendChannelDef(channel, legendParent) {
    return findChannelDefWithScale(legendParent.spec.encoding?.[channel]);
}

/**
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @param {import("../view/unitView.js").default} legendParent
 * @returns {boolean}
 */
function isExplicitLegendNull(channel, legendParent) {
    const channelDef = getLegendChannelDef(channel, legendParent);
    return Boolean(
        channelDef && "legend" in channelDef && channelDef.legend === null
    );
}

/**
 * @param {import("../spec/channel.js").ChannelWithScale} primary
 * @param {import("../spec/channel.js").ChannelWithScale} secondary
 * @param {import("../view/unitView.js").default} legendParent
 * @returns {boolean}
 */
function canMergeSymbolChannels(primary, secondary, legendParent) {
    const primaryDef = getLegendChannelDef(primary, legendParent);
    const secondaryDef = getLegendChannelDef(secondary, legendParent);
    const primaryResolution = legendParent.getScaleResolution(primary);
    const secondaryResolution = legendParent.getScaleResolution(secondary);

    return (
        isFieldDef(primaryDef) &&
        isFieldDef(secondaryDef) &&
        primaryDef.field === secondaryDef.field &&
        primaryResolution &&
        secondaryResolution &&
        shallowArrayEquals(
            primaryResolution.getDomain(),
            secondaryResolution.getDomain()
        )
    );
}

/**
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @param {import("../view/unitView.js").default} legendParent
 * @returns {boolean}
 */
function hasRedundantPrimaryLegend(channel, legendParent) {
    if (channel !== "shape") {
        return false;
    }

    const channelDef = getLegendChannelDef(channel, legendParent);
    if (!isFieldDef(channelDef)) {
        return false;
    }

    for (const primary of /** @type {const} */ (["color", "fill", "stroke"])) {
        if (
            canMergeSymbolChannels(primary, channel, legendParent) &&
            !isExplicitLegendNull(primary, legendParent)
        ) {
            return true;
        }
    }

    return false;
}

/**
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @param {import("../view/unitView.js").default} legendParent
 * @returns {Partial<Record<import("../spec/channel.js").ChannelWithScale, string>>}
 */
function getRedundantSymbolChannels(channel, legendParent) {
    if (!isColorChannel(channel)) {
        return {};
    }

    const channelDef = getLegendChannelDef(channel, legendParent);
    const shapeDef = getLegendChannelDef("shape", legendParent);
    const shapeResolution = legendParent.getScaleResolution("shape");

    if (
        isFieldDef(channelDef) &&
        isFieldDef(shapeDef) &&
        shapeResolution &&
        canMergeSymbolChannels(channel, "shape", legendParent) &&
        !isExplicitLegendNull("shape", legendParent)
    ) {
        return {
            shape: shapeResolution.name ?? "shape",
        };
    }

    return {};
}

/**
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @param {import("../view/unitView.js").default} legendParent
 * @returns {LegendDefinition | undefined}
 */
export function createLegendDefinition(channel, legendParent) {
    if (hasRedundantPrimaryLegend(channel, legendParent)) {
        return undefined;
    }

    const channelDef = getLegendChannelDef(channel, legendParent);
    if (!channelDef || isValueDef(channelDef)) {
        return undefined;
    }

    const explicitLegend =
        "legend" in channelDef ? channelDef.legend : undefined;
    if (explicitLegend === null) {
        return undefined;
    }

    const legendOverrides =
        explicitLegend === undefined
            ? undefined
            : /** @type {import("../spec/legend.js").LegendConfig} */ ({
                  disable: false,
                  .../** @type {import("../spec/legend.js").Legend} */ (
                      explicitLegend
                  ),
              });
    const legendDefaults = getConfiguredLegendDefaults(
        legendParent.getConfigScopes(),
        legendOverrides
    );
    if (legendDefaults.disable) {
        return undefined;
    }

    const legendType = getLegendType(channel, channelDef);
    if (!legendType) {
        return undefined;
    }

    const scaleResolution = legendParent.getScaleResolution(channel);
    if (!scaleResolution) {
        return undefined;
    }

    const channelTitle =
        /** @type {import("../spec/legend.js").Legend["title"] | undefined} */ (
            "title" in channelDef ? channelDef.title : undefined
        );
    const title =
        legendDefaults.title !== undefined
            ? legendDefaults.title
            : channelTitle !== undefined
              ? channelTitle
              : isFieldDef(channelDef)
                ? channelDef.field
                : undefined;
    const format = "format" in channelDef ? channelDef.format : undefined;
    const symbolChannels =
        legendType == "symbol"
            ? getRedundantSymbolChannels(channel, legendParent)
            : undefined;

    return {
        channel,
        type: legendType,
        symbolChannels,
        legend: {
            ...legendDefaults,
            title,
        },
        format,
        dataType: channelDef.type,
        scaleResolution,
    };
}
