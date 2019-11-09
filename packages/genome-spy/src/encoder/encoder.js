import fromEntries from "fromentries";

/**
 * @typedef {Object} EncoderMetadata
 * @prop {boolean} constant
 * @prop {function} invert
 * @prop {import("./accessor").Accessor} accessor
 *
 * @typedef {(function(object):(string|number)) & EncoderMetadata} Encoder
 * @typedef {(function(object):number) & EncoderMetadata} NumberEncoder
 */

/**
 * Creates an object that contains encoders for every channel of a mark
 *
 * @param {import("../view/viewUtils").EncodingSpecs} encodingSpecs
 * @param {function(string):function} scaleSource
 * @param {function(string):(import("./accessor").Accessor)} accessorSource
 * @returns {Object.<string, Encoder>}
 */
export default function createEncoders(
    encodingSpecs,
    scaleSource,
    accessorSource
) {
    return fromEntries(
        Object.keys(encodingSpecs)
            .filter(channel => encodingSpecs[channel] !== null)
            .map(channel => [
                channel,
                createEncoder(
                    encodingSpecs[channel],
                    scaleSource(primaryChannel(channel)),
                    accessorSource(channel),
                    channel
                )
            ])
    );
}

/**
 *
 * @param {import("../view/viewUtils").EncodingSpec} encodingSpec
 * @param {function} scaleSource
 * @param {import("./accessor").Accessor} accessor
 * @param {string} accessor
 * @returns {Encoder}
 */
function createEncoder(encodingSpec, scale, accessor, channel) {
    /** @type {Encoder} */
    let encoder;

    if (encodingSpec.value !== undefined) {
        encoder = /** @type {Encoder} */ (datum => encodingSpec.value);
        encoder.constant = true;
        encoder.accessor = null;
    } else if (accessor) {
        if (!scale) {
            throw new Error(
                `Missing scale! "${channel}": ${JSON.stringify(encodingSpec)}`
            );
        }

        // TODO: Provide access to vega-scale

        encoder = /** @type {Encoder} datum*/ datum => scale(accessor(datum));
        encoder.constant = /** @type {boolean} */ (!!accessor.constant);
        encoder.accessor = accessor;
    } else {
        throw new Error(
            `Missing value or accessor (field, expr, constant) on channel "${channel}": ${JSON.stringify(
                encodingSpec
            )}`
        );
    }

    encoder.invert = scale
        ? value => scale.invert(value)
        : value => {
              throw new Error(
                  "No scale available, cannot invert: " +
                      JSON.stringify(encodingSpec)
              );
          };

    return encoder;
}

/** @type {Object.<string, string>} */
export const secondaryChannels = {
    x: "x2",
    y: "y2"
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
