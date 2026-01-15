import {
    isColorChannel,
    isDiscreteChannel,
    isPositionalChannel,
} from "../encoder/encoder.js";
import { isContinuous } from "vega-scale";

import { NOMINAL, ORDINAL } from "../view/scaleResolutionConstants.js";

/**
 * @param {import("../spec/channel.js").Channel} channel
 * @param {import("../spec/channel.js").Type} dataType
 * @param {boolean} isExplicitDomain
 * @returns {import("../spec/scale.js").Scale}
 */
export function getDefaultScaleProperties(channel, dataType, isExplicitDomain) {
    /** @type {import("../spec/scale.js").Scale} */
    const props = {};

    if (isExplicitDomain) {
        props.zero = false;
    }

    if (isPositionalChannel(channel)) {
        props.nice = !isExplicitDomain;
    } else if (isColorChannel(channel)) {
        // TODO: Named ranges
        props.scheme =
            dataType == NOMINAL
                ? "tableau10"
                : dataType == ORDINAL
                  ? "blues"
                  : "viridis";
    } else if (isDiscreteChannel(channel)) {
        // Shapes of point mark, for example
        props.range =
            channel == "shape"
                ? ["circle", "square", "triangle-up", "cross", "diamond"]
                : [];
    } else if (channel == "size") {
        props.range = [0, 400]; // TODO: Configurable default. This is currently optimized for points.
    } else if (channel == "angle") {
        props.range = [0, 360];
    }

    return props;
}

/**
 * @param {import("../spec/scale.js").Scale} props
 * @param {import("../spec/channel.js").Channel} channel
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
