import { isValueDef, secondaryChannel } from "../encoder/encoder";

/**
 *
 * @typedef {import("../spec/channel").Encoding} Encoding
 * @typedef {import("../spec/channel").Channel} Channel
 */

/**
 * @param {Encoding} encoding
 * @param {Channel} channel
 */
export function fixPositional(encoding, channel) {
    const secondary = secondaryChannel(channel);
    if (encoding[channel]) {
        if (!encoding[secondary]) {
            if (encoding[channel].type == "quantitative") {
                // Bar plot, anchor the other end to zero
                encoding[secondary] = {
                    datum: 0,
                };
            } else {
                // Must make copies because the definition may be shared with other views/marks
                encoding[channel] = { ...encoding[channel] };
                encoding[secondary] = { ...encoding[channel] };

                // Fill the bands (bar plot / heatmap)
                // We are following the Vega-Lite convention:
                // the band property works differently on rectangular marks, i.e., it adjusts the band coverage.
                const adjustment = (1 - (encoding[channel].band || 1)) / 2;
                encoding[channel].band = 0 + adjustment;
                encoding[secondary].band = 1 - adjustment;

                // TODO: If the secondary channel duplicates the primary channel
                // the data should be uploaded to the GPU only once.
            }
        } else if (encoding[channel].type != "quantitative") {
            const adjustment = (1 - (encoding[channel].band || 1)) / 2;
            encoding[channel].band = adjustment;
            encoding[secondary].band = -adjustment;
        }
    } else if (encoding[secondary]) {
        throw new Error(
            `Only secondary channel ${secondary} has been specified!`
        );
    } else {
        // Nothing specified, fill the whole viewport
        encoding[channel] = { value: 0 };
        encoding[secondary] = { value: 1 };
    }
}

/**
 * @param {import("../spec/channel").Encoding} encoding
 * @param {boolean} filled
 */
export function fixStroke(encoding, filled) {
    if (!encoding.stroke) {
        if (filled) {
            encoding.stroke = { value: null };
        } else {
            encoding.stroke = encoding.color;
            // TODO: Whattabout default strokeWidth?
        }
    }

    if (isValueDef(encoding.stroke) && encoding.stroke.value === null) {
        encoding.strokeWidth = { value: 0 };
    }

    if (!encoding.strokeOpacity) {
        encoding.strokeOpacity = encoding.opacity;
    }
}

/**
 * @param {import("../spec/channel").Encoding} encoding
 * @param {boolean} filled
 */
export function fixFill(encoding, filled) {
    if (isValueDef(encoding.fill) && encoding.fill.value === null) {
        encoding.fillOpacity = { value: 0 };
    } else if (!encoding.fill) {
        encoding.fill = encoding.color;
        if (!filled && !encoding.fillOpacity) {
            encoding.fillOpacity = { value: 0 };
        }
    }

    if (!encoding.fillOpacity) {
        if (filled) {
            encoding.fillOpacity = encoding.opacity;
        } else {
            encoding.fillOpacity = { value: 0 };
        }
    }
}
