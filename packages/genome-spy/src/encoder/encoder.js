import fromEntries from "fromentries";

/**
 * @typedef {Object} EncoderMetadata
 * @prop {boolean} constant
 * @prop {function} invert
 * @prop {Scale} [scale]
 * @prop {import("./accessor").Accessor} accessor
 * @prop {import("../view/viewUtils").EncodingConfig} encodingConfig
 * @prop {function(function):void} applyMetadata Copies metadata to the target function
 *
 * @typedef {(function(object):(string|number)) & EncoderMetadata} Encoder
 * @typedef {(function(object):number) & EncoderMetadata} NumberEncoder
 *
 * @typedef {Object} ScaleAccessories
 * @prop {string} type
 * @prop {function():any[] | function():void} domain
 * @prop {any} range
 * @prop {function} invert 
 * 
 * @typedef {
    import("d3-scale").ScaleContinuousNumeric<any, any> |
    import("d3-scale").ScaleLinear<any, any> |
    import("d3-scale").ScalePower<any, any> |
    import("d3-scale").ScaleLogarithmic<any, any> |
    import("d3-scale").ScaleSymLog<any, any> |
    import("d3-scale").ScaleIdentity |
    import("d3-scale").ScaleTime<any, any> |
    import("d3-scale").ScaleSequential<any> |
    import("d3-scale").ScaleDiverging<any> | 
    import("d3-scale").ScaleQuantize<any> |
    import("d3-scale").ScaleQuantile<any> |
    import("d3-scale").ScaleThreshold<any, any> |
    import("d3-scale").ScaleOrdinal<any, any> |
    import("d3-scale").ScaleBand<any> |
    import("d3-scale").ScalePoint<any>
   } D3Scale
 * 
 * @typedef {D3Scale & ScaleAccessories} Scale
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
 * @param {Scale} scale
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

    /** @param {Encoder} target */
    encoder.applyMetadata = target => {
        for (const prop in encoder) {
            if (encoder.hasOwnProperty(prop)) {
                target[prop] = encoder[prop];
            }
        }
        return target;
    };

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
