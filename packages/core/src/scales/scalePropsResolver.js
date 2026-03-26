import { isDiscrete } from "vega-scale";
import { isColorChannel } from "../encoder/encoder.js";

import mergeObjects from "../utils/mergeObjects.js";
import {
    getConfiguredScaleConfig,
    getConfiguredScaleDefaults,
    getConfiguredNamedRange,
    isConfigRangeName,
} from "../config/scaleConfig.js";
import { applyLockedProperties, getDefaultScaleType } from "./scaleRules.js";
import { INDEX, LOCUS } from "./scaleResolutionConstants.js";

/**
 * @typedef {import("../spec/channel.js").Channel} Channel
 * @typedef {import("../spec/scale.js").Scale} Scale
 * @typedef {import("./scaleResolution.js").ScaleResolutionMember} ScaleResolutionMember
 */

/**
 * @param {object} options
 * @param {Channel} options.channel
 * @param {import("../spec/channel.js").Type} options.dataType
 * @param {ScaleResolutionMember[]} options.orderedMembers
 * @param {boolean} options.isExplicitDomain
 * @param {import("../spec/config.js").GenomeSpyConfig[]} options.configScopes
 * @returns {Scale}
 */
export function resolveScalePropsBase({
    channel,
    dataType,
    orderedMembers,
    isExplicitDomain,
    configScopes,
}) {
    const memberList = orderedMembers;

    const markTypes = memberList
        .map((member) =>
            typeof member.view.getMarkType == "function"
                ? member.view.getMarkType()
                : undefined
        )
        .filter((markType) => !!markType);

    const propArray = memberList
        .map((member) => member.channelDef.scale)
        .filter((props) => props !== undefined);

    // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
    const mergedProps = mergeObjects(propArray, "scale", ["domain"]);
    if (mergedProps === null || mergedProps.type == "null") {
        return /** @type {Scale} */ ({ type: "null" });
    }

    const props = {
        ...getConfiguredScaleDefaults(configScopes, {
            channel,
            dataType,
            isExplicitDomain,
            markTypes: /** @type {import("../spec/mark.js").MarkType[]} */ (
                markTypes
            ),
            hasDomainMid: mergedProps.domainMid !== undefined,
        }),
        ...mergedProps,
    };

    if (!props.type) {
        // TODO: When discrete positional scale inference is revisited, plumb
        // mark-level context into getDefaultScaleType instead of deciding only
        // from channel + data type. The `markTypes` collection above is the
        // natural starting point for a Vega-Lite-like band-vs-point choice,
        // including future rect-backed marks such as "bar".
        props.type = getDefaultScaleType(channel, dataType);
    }

    if (typeof props.range == "string") {
        if (!isConfigRangeName(props.range)) {
            throw new Error(
                'Unknown named scale range "' +
                    props.range +
                    '". Supported names: shape, size, angle, heatmap, ramp, diverging.'
            );
        }

        const resolvedNamedRange = getConfiguredNamedRange(
            configScopes,
            props.range
        );
        if (resolvedNamedRange === undefined) {
            throw new Error(
                'Named scale range "' +
                    props.range +
                    '" is not configured in config.range.'
            );
        }

        if (
            isColorChannel(channel) &&
            (typeof resolvedNamedRange == "string" ||
                (resolvedNamedRange != null &&
                    typeof resolvedNamedRange == "object" &&
                    !Array.isArray(resolvedNamedRange)))
        ) {
            props.scheme =
                /** @type {import("../spec/scale.js").Scale["scheme"]} */ (
                    resolvedNamedRange
                );
            delete props.range;
        } else {
            props.range =
                /** @type {import("../spec/scale.js").Scale["range"]} */ (
                    resolvedNamedRange
                );
        }
    }

    // Reverse discrete y axis
    if (
        channel == "y" &&
        isDiscrete(props.type) &&
        props.reverse == undefined
    ) {
        props.reverse = true;
    }

    if (props.range && props.scheme) {
        delete props.scheme;
        // TODO: Props should be set more intelligently
    }

    // By default, index and locus scales are zoomable, others are not.
    // Config can override this baseline via scale.zoom.
    if (!("zoom" in props)) {
        const scaleConfig = getConfiguredScaleConfig(configScopes, dataType);
        if (scaleConfig.zoom !== undefined) {
            props.zoom = scaleConfig.zoom;
        } else if ([INDEX, LOCUS].includes(props.type)) {
            props.zoom = true;
        }
    }

    applyLockedProperties(props, channel);

    return props;
}

/**
 * @param {Scale} props
 * @param {Channel} channel
 */
