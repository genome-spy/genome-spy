import { isNumber } from "vega-util";
import { isDiscrete } from "vega-scale";
import createIndexer from "../utils/indexer";

/**
 * @typedef {Object} EncoderMetadata
 * @prop {boolean} constant True if the accessor returns the same value for all objects
 * @prop {boolean} constantValue True the encoder returns a "value" without a scale
 * @prop {function} invert
 * @prop {VegaScale} [scale]
 * @prop {import("./accessor").Accessor} accessor 
 * @prop {function(any):number} [indexer] Converts ordinal values to index numbers
 * @prop {import("../view/viewUtils").ChannelDef} channelDef
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
 * @param {Record<string, import("../view/viewUtils").ChannelDef>} [encoding] Taken from the mark if not provided
 * @returns {Record<string, Encoder>}
 */
export default function createEncoders(mark, encoding) {
    /** @type {Record<string, Encoder>} */
    const encoders = {};

    if (!encoding) {
        encoding = mark.encoding;
    }

    for (const [channel, channelDef] of Object.entries(encoding)) {
        if (!channelDef) {
            continue;
        }

        const resolution = mark.unitView.getScaleResolution(
            primaryChannel(channel)
        );
        const scale = (resolution && resolution.getScale()) || undefined;

        encoders[channel] = createEncoder(
            encoding[channel],
            scale,
            mark.unitView.getAccessor(channel),
            channel
        );
    }

    return encoders;
}

/**
 *
 * @param {import("../view/viewUtils").ChannelDef} channelDef
 * @param {any} scale
 * @param {import("./accessor").Accessor} accessor
 * @param {string} channel
 * @returns {Encoder}
 */
export function createEncoder(channelDef, scale, accessor, channel) {
    /** @type {Encoder} */
    let encoder;

    if (isValueDef(channelDef)) {
        encoder = /** @type {Encoder} */ (datum => channelDef.value);
        encoder.constant = true;
        encoder.constantValue = true;
        encoder.accessor = undefined;
    } else if (accessor) {
        if (channel == "text") {
            // TODO: Define somewhere channels that don't use a scale
            encoder = /** @type {Encoder} */ (datum => undefined);
            encoder.accessor = accessor;
            encoder.constant = accessor.constant;
        } else {
            if (!scale) {
                throw new Error(
                    `Missing scale! "${channel}": ${JSON.stringify(channelDef)}`
                );
            }

            encoder = /** @type {Encoder} */ (datum => scale(accessor(datum)));

            if (isDiscrete(scale.type)) {
                // TODO: pass the found values back to the scale/resolution
                const indexer = createIndexer();
                indexer.addAll(scale.domain());
                encoder.indexer = d => indexer(accessor(d));
            }

            encoder.constant = accessor.constant;
            encoder.accessor = accessor;
            encoder.scale = scale;
        }
    } else {
        throw new Error(
            `Missing value or accessor (field, expr, datum) on channel "${channel}": ${JSON.stringify(
                channelDef
            )}`
        );
    }

    // TODO: Modifier should be inverted too
    encoder.invert = scale
        ? value => scale.invert(value)
        : value => {
              throw new Error(
                  "No scale available, cannot invert: " +
                      JSON.stringify(channelDef)
              );
          };

    // Just to provide a convenient access to the config
    encoder.channelDef = channelDef;

    /** @param {Encoder} target */
    encoder.applyMetadata = target => {
        for (const prop in encoder) {
            if (prop in encoder) {
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
 * @param {import("../view/view").ChannelDef} channelDef
 */
export function isValueDef(channelDef) {
    return channelDef && "value" in channelDef;
}

/**
 * @param {import("../view/view").ChannelDef} channelDef
 */
export function isDatumDef(channelDef) {
    return channelDef && "datum" in channelDef;
}

/**
 * Map primary channels to secondarys
 *
 * @type {Record<string, string>}
 */
export const secondaryChannels = {
    x: "x2",
    y: "y2",
    size: "size2",
    color: "color2"
};

/**
 * Map secondary channels to primaries
 *
 * @type {Record<string, string>}
 */
export const primaryChannels = Object.fromEntries(
    Object.entries(secondaryChannels).map(entry => [entry[1], entry[0]])
);

/**
 *
 * @param {string} channel
 */
export function isSecondaryChannel(channel) {
    return channel in primaryChannels;
}

/**
 * Return the matching secondary channel or throws if one does not exist.
 *
 * @param {string} primaryChannel
 */
export function secondaryChannel(primaryChannel) {
    const secondary = secondaryChannels[primaryChannel];
    if (secondary) {
        return secondary;
    } else {
        throw new Error(`${primaryChannel} has no secondary channel!`);
    }
}

/**
 * Finds the primary channel for the provided channel, which may be
 * the primary or secondary.
 *
 * @param {string} maybeSecondary
 */
export function primaryChannel(maybeSecondary) {
    return primaryChannels[maybeSecondary] || maybeSecondary;
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

/**
 * @param {string} channel
 */
export function isPositionalChannel(channel) {
    return ["x", "y"].includes(primaryChannel(channel));
}

/**
 * @param {string} channel
 */
export function isColorChannel(channel) {
    return ["color", "fill"].includes(primaryChannel(channel));
}

/**
 * Returns true if the channel has a discrete range.
 *
 * @param {string} channel
 */
export function isDiscreteChannel(channel) {
    return ["shape", "squeeze"].includes(channel);
}

/**
 * Returns valid discrete values for a discrete channel.
 *
 * @param {string} channel
 * @returns {any[]}
 */
export function getDiscreteRange(channel) {
    // TODO: This is not easily extendable. Figure out a more dynamic approach.
    switch (channel) {
        case "shape":
            return [
                "circle",
                "square",
                "triangle-up",
                "cross",
                "diamond",
                "triangle-down",
                "triangle-right",
                "triangle-left"
            ];
        case "squeeze":
            return ["none", "top", "right", "bottom", "left"];
        default:
    }
}

/**
 * @param {string} channel
 * @returns {function(any):number}
 */
export function getDiscreteRangeMapper(channel) {
    if (!isDiscreteChannel(channel)) {
        throw new Error("Not a discrete channel: " + channel);
    }

    const valueMap = new Map(
        getDiscreteRange(channel).map((value, i) => [value, i])
    );

    return value => {
        const mapped = valueMap.get(value);
        if (mapped !== undefined) {
            return mapped;
        }
        throw new Error(`Invalid value for "${channel}" channel: ${value}`);
    };
}
