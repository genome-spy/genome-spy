import fromEntries from "fromentries";

/**
 * @typedef {Object} EncoderMetadata
 * @prop {boolean} constant
 * @prop {function} invert
 * @prop {function} [scale]
 * @prop {import("./accessor").Accessor} accessor
 * @prop {import("../view/viewUtils").EncodingConfig} encodingConfig
 *
 * @typedef {(function(object):(string|number)) & EncoderMetadata} Encoder
 * @typedef {(function(object):number) & EncoderMetadata} NumberEncoder
 */

/**
 * Creates an object that contains encoders for every channel of a mark
 *
 * @param {Record.<string, import("../view/viewUtils").EncodingConfig>} encodingConfigs
 * @param {function(string):function} scaleSource
 * @param {function(string):(import("./accessor").Accessor)} accessorSource
 * @returns {Object.<string, Encoder>}
 */
export default function createEncoders(
    encodingConfigs,
    scaleSource,
    accessorSource
) {
    return fromEntries(
        Object.keys(encodingConfigs)
            .filter(channel => encodingConfigs[channel] !== null)
            .map(channel => [
                channel,
                createEncoder(
                    encodingConfigs[channel],
                    scaleSource(primaryChannel(channel)),
                    accessorSource(channel),
                    channel
                )
            ])
    );
}

/**
 *
 * @param {import("../view/viewUtils").EncodingConfig} encodingConfig
 * @param {function} scale
 * @param {import("./accessor").Accessor} accessor
 * @param {string} channel
 * @returns {Encoder}
 */
function createEncoder(encodingConfig, scale, accessor, channel) {
    /** @type {Encoder} */
    let encoder;

    if (encodingConfig.value !== undefined) {
        encoder = /** @type {Encoder} */ (datum => encodingConfig.value);
        encoder.constant = true;
        encoder.accessor = null;
    } else if (accessor) {
        if (!scale && channel != "text") {
            // TODO: Define somewhere channels that don't use a scale
            throw new Error(
                `Missing scale! "${channel}": ${JSON.stringify(encodingConfig)}`
            );
        }

        // TODO: Provide access to vega-scale

        encoder = /** @type {Encoder} datum*/ datum => scale(accessor(datum));
        encoder.constant = /** @type {boolean} */ (!!accessor.constant);
        encoder.accessor = accessor;
        encoder.scale = scale;
    } else {
        throw new Error(
            `Missing value or accessor (field, expr, datum) on channel "${channel}": ${JSON.stringify(
                encodingConfig
            )}`
        );
    }

    encoder.invert = scale
        ? value => scale.invert(value)
        : value => {
              throw new Error(
                  "No scale available, cannot invert: " +
                      JSON.stringify(encodingConfig)
              );
          };

    // Just to provide a convenient access to the config
    encoder.encodingConfig = encodingConfig;

    return encoder;
}

/** @type {Object.<string, string>} */
export const secondaryChannels = {
    x: "x2",
    y: "y2",
    size: "size2",
    color: "color2"
};

/**
 *
 * @param {string} channel
 */
export function isSecondaryChannel(channel) {
    return Object.values(secondaryChannels).includes(channel);
}

/**
 *
 * @param {string} maybeSecondary
 */
export function primaryChannel(maybeSecondary) {
    for (const entry of Object.entries(secondaryChannels)) {
        if (entry[1] === maybeSecondary) {
            return entry[0];
        }
    }

    return maybeSecondary;
}

/**
 * Returns an array that contains the given channel and its secondary channel if one exists.
 *
 * @param {string} channel
 */
export function channelWithSecondarys(channel) {
    return secondaryChannels[channel]
        ? [channel, secondaryChannels[channel]]
        : [channel];
}
