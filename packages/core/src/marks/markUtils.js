import {
    isValueDef,
    getSecondaryChannel,
    isChannelDefWithScale,
    findChannelDefWithScale,
} from "../encoder/encoder.js";

/**
 *
 * @typedef {import("../spec/channel.js").Encoding} Encoding
 * @typedef {import("../spec/channel.js").Channel} Channel
 */

/**
 * @param {Encoding} encoding
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
 */
export function fixPositional(encoding, channel) {
    const secondaryChannel = getSecondaryChannel(channel);

    // Must make copies because the definition may be shared with other views/marks
    let primary = encoding[channel] && { ...encoding[channel] };
    let secondary = encoding[secondaryChannel] && {
        ...encoding[secondaryChannel],
    };

    if (isValueDef(primary) || isValueDef(secondary)) {
        return;
    }

    if (primary) {
        // TODO: fix. May not be a proper type guard.
        if (!isChannelDefWithScale(encoding[channel])) {
            // nop
            return;
        }

        if (!secondary) {
            if (primary.type == "quantitative") {
                // Bar plot, anchor the other end to zero
                secondary = { datum: 0, domainInert: true };
            } else {
                secondary = { ...primary };

                // Fill the bands (bar plot / heatmap)
                // We are following the Vega-Lite convention:
                // the band property works differently on rectangular marks, i.e., it adjusts the band coverage.
                const adjustment = (1 - (primary.band ?? 1)) / 2;
                primary.band = 0 + adjustment;
                secondary.band = 1 - adjustment;

                // TODO: If the secondary channel duplicates the primary channel
                // the data should be uploaded to the GPU only once.
            }
        } else if (primary.type != "quantitative") {
            const adjustment = (1 - (primary.band || 1)) / 2;
            primary.band = adjustment;
            secondary.band = -adjustment;
        }
    } else {
        // Nothing specified, fill the whole viewport
        primary = { value: 0 };
        secondary = { value: 1 };
    }

    encoding[channel] = primary;
    encoding[secondaryChannel] = secondary;
}

/**
 *
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @param {import("../spec/channel.js").ChannelWithScale} resolutionChannel
 */
function setResolutionChannel(channelDef, resolutionChannel) {
    const def = findChannelDefWithScale(channelDef);
    if (def) {
        def.resolutionChannel = resolutionChannel;
    }
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {boolean} filled
 */
export function fixStroke(encoding, filled) {
    if (!encoding.stroke) {
        if (filled) {
            encoding.stroke = { value: null };
        } else {
            encoding.stroke = structuredClone(encoding.color);
            setResolutionChannel(encoding.stroke, "color");
            // TODO: Whattabout default strokeWidth?
        }
    }

    if (isValueDef(encoding.stroke) && encoding.stroke.value === null) {
        encoding.strokeWidth = { value: 0 };
    }

    if (!encoding.strokeOpacity) {
        encoding.strokeOpacity = structuredClone(encoding.opacity);
        setResolutionChannel(encoding.strokeOpacity, "opacity");
    }
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {boolean} filled
 */
export function fixFill(encoding, filled) {
    if (isValueDef(encoding.fill) && encoding.fill.value === null) {
        encoding.fillOpacity = { value: 0 };
    } else if (!encoding.fill) {
        encoding.fill = structuredClone(encoding.color);
        setResolutionChannel(encoding.fill, "color");

        if (!filled && !encoding.fillOpacity) {
            encoding.fillOpacity = { value: 0 };
        }
    }

    if (!encoding.fillOpacity) {
        if (filled) {
            encoding.fillOpacity = structuredClone(encoding.opacity);
            setResolutionChannel(encoding.fillOpacity, "opacity");
        } else {
            encoding.fillOpacity = { value: 0 };
        }
    }
}

/**
 * @param {import("../spec/mark.js").MarkProps} props
 * @returns {props is import("../spec/mark.js").PointProps}
 */
export function isPointProps(props) {
    return props.type === "point";
}

/**
 * @param {import("../spec/mark.js").MarkProps} props
 * @returns {props is import("../spec/mark.js").RectProps}
 */
export function isRectProps(props) {
    return props.type === "point";
}

/**
 * @param {import("../spec/mark.js").MarkProps} props
 * @returns {props is import("../spec/mark.js").RuleProps}
 */
export function isRuleProps(props) {
    return props.type === "point";
}

/**
 * @param {import("../spec/mark.js").MarkProps} props
 * @returns {props is import("../spec/mark.js").TextProps}
 */
export function isTextProps(props) {
    return props.type === "point";
}

/**
 * @param {import("../spec/mark.js").MarkProps} props
 * @returns {props is import("../spec/mark.js").LinkProps}
 */
export function isLinkProps(props) {
    return props.type === "point";
}
