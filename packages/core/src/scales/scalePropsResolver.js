import { isDiscrete } from "vega-scale";

import mergeObjects from "../utils/mergeObjects.js";
import { getDefaultScaleProperties } from "../config/scaleDefaults.js";
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
 * @param {Set<ScaleResolutionMember>} options.members
 * @param {boolean} options.isExplicitDomain
 * @returns {Scale}
 */
export function resolveScalePropsBase({
    channel,
    dataType,
    members,
    isExplicitDomain,
}) {
    const propArray = Array.from(members)
        .map((member) => member.channelDef.scale)
        .filter((props) => props !== undefined);

    // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
    const mergedProps = mergeObjects(propArray, "scale", ["domain"]);
    if (mergedProps === null || mergedProps.type == "null") {
        return /** @type {Scale} */ ({ type: "null" });
    }

    const props = {
        ...getDefaultScaleProperties(channel, dataType, isExplicitDomain),
        ...mergedProps,
    };

    if (!props.type) {
        props.type = getDefaultScaleType(channel, dataType);
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

    // By default, index and locus scales are zoomable, others are not
    if (!("zoom" in props) && [INDEX, LOCUS].includes(props.type)) {
        props.zoom = true;
    }

    applyLockedProperties(props, channel);

    return props;
}

/**
 * @param {Scale} props
 * @param {Channel} channel
 */
