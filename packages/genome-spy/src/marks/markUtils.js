import { isValueDef, secondaryChannel } from "../encoder/encoder";

/**
 * @param {Record<string, import("../view/view").ChannelDef>} encoding
 * @param {string} channel
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
 * @param {Record<string, import("../view/view").ChannelDef>} encoding
 */
export function fixStroke(encoding) {
    if (isValueDef(encoding.stroke) && encoding.stroke.value === null) {
        encoding.strokeWidth = { value: 0 };
    }
}
