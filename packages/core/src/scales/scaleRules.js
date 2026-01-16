import { isContinuous } from "vega-scale";

import {
    isPositionalChannel,
    isPrimaryPositionalChannel,
} from "../encoder/encoder.js";
import {
    INDEX,
    LOCUS,
    NOMINAL,
    ORDINAL,
    QUANTITATIVE,
} from "./scaleResolutionConstants.js";

/**
 * @typedef {import("../spec/channel.js").Channel} Channel
 */

/**
 * @param {Channel} channel
 * @param {import("../spec/channel.js").Type} dataType
 * @returns {import("../spec/scale.js").ScaleType}
 */
export function getDefaultScaleType(channel, dataType) {
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
 * @param {import("../spec/scale.js").Scale} props
 * @param {Channel} channel
 */
export function applyLockedProperties(props, channel) {
    if (isPositionalChannel(channel) && props.type !== "ordinal") {
        // Unit ranges are a temporary default until pixel ranges are adopted.
        props.range = [0, 1];
    }

    if (channel == "opacity" && isContinuous(props.type)) {
        props.clamp = true;
    }
}
