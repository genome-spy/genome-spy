import { isDiscrete } from "vega-scale";

import mergeObjects from "../utils/mergeObjects.js";
import { isPrimaryPositionalChannel } from "../encoder/encoder.js";
import {
    applyLockedProperties,
    getDefaultScaleProperties,
} from "../config/scaleDefaults.js";
import {
    INDEX,
    LOCUS,
    NOMINAL,
    ORDINAL,
    QUANTITATIVE,
} from "./scaleResolutionConstants.js";

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
 * @param {Channel} channel
 * @param {import("../spec/channel.js").Type} dataType
 * @param {boolean} isExplicitDomain
 * @returns {Scale}
 */
/**
 * @param {Channel} channel
 * @param {import("../spec/channel.js").Type} dataType
 * @returns {import("../spec/scale.js").ScaleType}
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    if (dataType == INDEX || dataType == LOCUS) {
        if (isPrimaryPositionalChannel(channel)) {
            return dataType;
        } else {
            // TODO: Also explicitly set scales should be validated
            throw new Error(
                channel +
                    " does not support " +
                    dataType +
                    " data type. Only positional channels do."
            );
        }
    }

    /**
     * @type {Partial<Record<Channel, (import("../spec/scale.js").ScaleType | undefined)[]>>}
     * Default types: nominal, ordinal, quantitative.
     * undefined = incompatible, "null" = disabled (pass-thru)
     */
    const defaults = {
        x: ["band", "band", "linear"],
        y: ["band", "band", "linear"],
        size: [undefined, "point", "linear"],
        opacity: [undefined, "point", "linear"],
        fillOpacity: [undefined, "point", "linear"],
        strokeOpacity: [undefined, "point", "linear"],
        color: ["ordinal", "ordinal", "linear"],
        fill: ["ordinal", "ordinal", "linear"],
        stroke: ["ordinal", "ordinal", "linear"],
        strokeWidth: [undefined, undefined, "linear"],
        shape: ["ordinal", "ordinal", undefined],
        dx: [undefined, undefined, "null"],
        dy: [undefined, undefined, "null"],
        angle: [undefined, undefined, "linear"],
        sample: ["null", undefined, undefined],
    };

    /** @type {Channel[]} */
    const typelessChannels = ["sample"];

    const type = typelessChannels.includes(channel)
        ? "null"
        : defaults[channel]
          ? defaults[channel][
                [NOMINAL, ORDINAL, QUANTITATIVE].indexOf(dataType)
            ]
          : dataType == QUANTITATIVE
            ? "linear"
            : "ordinal";

    if (type === undefined) {
        throw new Error(
            'Channel "' +
                channel +
                '" is not compatible with "' +
                dataType +
                '" data type. Use of a proper scale may be needed.'
        );
    }

    return type;
}

/**
 * @param {Scale} props
 * @param {Channel} channel
 */
