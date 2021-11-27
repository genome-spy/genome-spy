import {
    isValueDef,
    getSecondaryChannel,
    isChannelDefWithScale,
} from "../encoder/encoder";

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
    const secondary = getSecondaryChannel(channel);
    if (encoding[channel]) {
        if (!isChannelDefWithScale(encoding[channel])) {
            // nop
            return;
        }

        const _encoding =
            /** @type {Partial<Record<Channel, import("../spec/channel").ChannelDefWithScale>>} */ (
                encoding
            );

        if (!_encoding[secondary]) {
            if (_encoding[channel].type == "quantitative") {
                // Bar plot, anchor the other end to zero
                // @ts-expect-error TODO: Remove once type is optional / not needed on secondary channel
                encoding[secondary] = {
                    datum: 0,
                };
            } else {
                // Must make copies because the definition may be shared with other views/marks
                _encoding[channel] = { ..._encoding[channel] };
                _encoding[secondary] = { ..._encoding[channel] };

                // Fill the bands (bar plot / heatmap)
                // We are following the Vega-Lite convention:
                // the band property works differently on rectangular marks, i.e., it adjusts the band coverage.
                const adjustment = (1 - (_encoding[channel].band || 1)) / 2;
                _encoding[channel].band = 0 + adjustment;
                _encoding[secondary].band = 1 - adjustment;

                // TODO: If the secondary channel duplicates the primary channel
                // the data should be uploaded to the GPU only once.
            }
        } else if (_encoding[channel].type != "quantitative") {
            const adjustment = (1 - (_encoding[channel].band || 1)) / 2;
            _encoding[channel].band = adjustment;
            _encoding[secondary].band = -adjustment;
        }
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
            encoding.stroke = {
                resolutionChannel: "color",
                ...encoding.color,
            };
            // TODO: Whattabout default strokeWidth?
        }
    }

    if (isValueDef(encoding.stroke) && encoding.stroke.value === null) {
        encoding.strokeWidth = { value: 0 };
    }

    if (!encoding.strokeOpacity) {
        encoding.strokeOpacity = {
            resolutionChannel: "opacity",
            ...encoding.opacity,
        };
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
        encoding.fill = {
            resolutionChannel: "color",
            ...encoding.color,
        };
        if (!filled && !encoding.fillOpacity) {
            encoding.fillOpacity = { value: 0 };
        }
    }

    if (!encoding.fillOpacity) {
        if (filled) {
            encoding.fillOpacity = {
                resolutionChannel: "opacity",
                ...encoding.opacity,
            };
        } else {
            encoding.fillOpacity = { value: 0 };
        }
    }
}
