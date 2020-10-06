import { isNumber } from "vega-util";

/**
 * @typedef {Object} EncoderMetadata
 * @prop {boolean} constant
 * @prop {function} invert
 * @prop {VegaScale} [scale]
 * @prop {import("./accessor").Accessor} accessor
 * @prop {import("../view/viewUtils").EncodingConfig} encodingConfig
 * @prop {function(function):void} applyMetadata Copies metadata to the target function
 *
 * @typedef {(function(object):(string|number)) & EncoderMetadata} Encoder
 * @typedef {(function(object):number) & EncoderMetadata} NumberEncoder
 *
 * @typedef {object} ScaleMetadata
 * @prop {string} type Scale type
 * @prop {boolean} fp64 Whether to use emulated 64 bit floating point in WebGL
 * 
 * @typedef {(
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
    )} D3Scale
 * 
 * @typedef {D3Scale & ScaleMetadata} VegaScale
 */

/**
 * Creates an object that contains encoders for every channel of a mark
 *
 * TODO: This should actually receive the mark as parameter
 *
 * TODO: This method should have a test. But how to mock Mark...
 *
 * @param {import("../marks/mark").default} mark
 * @param {Record<string, import("../view/viewUtils").EncodingConfig>} [encodingConfigs] Taken from the mark if not provided
 * @returns {Record<string, Encoder>}
 */
export default function createEncoders(mark, encodingConfigs) {
    /** @type {Record<string, Encoder>} */
    const encoders = {};

    if (!encodingConfigs) {
        encodingConfigs = mark.getEncoding();
    }

    for (const [channel, encodingConfig] of Object.entries(encodingConfigs)) {
        if (!encodingConfig) {
            continue;
        }

        const resolution = mark.unitView.getResolution(primaryChannel(channel));
        const scale = (resolution && resolution.getScale()) || undefined;

        const modifier = scale
            ? createModifier(scale, encodingConfig, channel, mark.getType())
            : undefined;

        encoders[channel] = createEncoder(
            encodingConfigs[channel],
            scale,
            mark.unitView.getAccessor(channel),
            channel,
            modifier
        );
    }

    return encoders;
}

/**
 *
 * @param {import("../view/viewUtils").EncodingConfig} encodingConfig
 * @param {VegaScale} scale
 * @param {import("./accessor").Accessor} accessor
 * @param {string} channel
 * @param {function(any):any} [modifier]
 * @returns {Encoder}
 */
export function createEncoder(
    encodingConfig,
    scale,
    accessor,
    channel,
    modifier
) {
    /** @type {Encoder} */
    let encoder;

    if (isValueEncoding(encodingConfig)) {
        encoder = /** @type {Encoder} */ (datum => encodingConfig.value);
        encoder.constant = true;
        encoder.accessor = undefined;
    } else if (accessor) {
        if (channel == "text") {
            // TODO: Define somewhere channels that don't use a scale
            encoder = /** @type {Encoder} */ (datum => undefined);
            encoder.accessor = accessor;
            encoder.constant = /** @type {boolean} */ (!!accessor.constant);
        } else {
            if (!scale) {
                throw new Error(
                    `Missing scale! "${channel}": ${JSON.stringify(
                        encodingConfig
                    )}`
                );
            }

            if (!modifier) {
                modifier = x => x;
            }

            encoder = /** @type {Encoder} */ (datum =>
                modifier(scale(accessor(datum))));
            encoder.constant = /** @type {boolean} */ (!!accessor.constant);
            encoder.accessor = accessor;
            encoder.scale = scale;
        }
    } else {
        throw new Error(
            `Missing value or accessor (field, expr, datum) on channel "${channel}": ${JSON.stringify(
                encodingConfig
            )}`
        );
    }

    // TODO: Modifier should be inverted too
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

/**
 * TODO: Move to a more generic place
 *
 * @param {import("../view/view").EncodingConfig} encodingConfig
 */
function isValueEncoding(encodingConfig) {
    return encodingConfig.value !== undefined;
}

/**
 * Creates a post-scale modifier
 *
 * @param {VegaScale} scale
 * @param {import("../view/view").EncodingConfig} encodingConfig
 * @param {string} channel
 * @param {string} markType
 * @returns {function(any):any}
 */
function createModifier(scale, encodingConfig, channel, markType) {
    if (scale.type == "band") {
        const bandOffset =
            (isNumber(encodingConfig.band) ? encodingConfig.band : 0.5) *
            scale.bandwidth();
        return x => x + bandOffset;
    }
    return x => x;
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
 * @param {string} channel
 */
export function secondaryChannel(channel) {
    const secondary = secondaryChannels[channel];
    if (secondary) {
        return secondary;
    } else {
        throw new Error(`${channel} has no secondary channel!`);
    }
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
