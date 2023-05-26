import { isDiscrete } from "vega-scale";
import createIndexer from "../utils/indexer";
import scaleNull from "../utils/scaleNull";

/**
 * @typedef {Object} EncoderMetadata
 * @prop {boolean} constant True if the accessor returns the same value for all objects
 * @prop {boolean} constantValue True the encoder returns a "value" without a scale
 * @prop {(value: import("../spec/channel").Scalar) => import("../spec/channel").Scalar} invert
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
 * @prop {boolean} [fp64] Whether to use emulated 64 bit floating point in WebGL
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
 * @typedef {(D3Scale | import("../genome/scaleIndex").ScaleIndex | import("../genome/scaleLocus").ScaleLocus) & ScaleMetadata} VegaScale
 * 
 * @typedef {import("../spec/channel").Channel} Channel
 */

/**
 * Creates an object that contains encoders for every channel of a mark
 *
 * TODO: This should actually receive the mark as parameter
 *
 * TODO: This method should have a test. But how to mock Mark...
 *
 * @param {import("../marks/mark").default} mark
 * @param {import("../spec/channel").Encoding} [encoding] Taken from the mark if not provided
 * @returns {Partial<Record<Channel, Encoder>>}
 */
export default function createEncoders(mark, encoding) {
    /** @type {Partial<Record<import("../spec/channel").Channel, Encoder>>} */
    const encoders = {};

    if (!encoding) {
        encoding = mark.encoding;
    }

    for (const [channel, channelDef] of Object.entries(encoding)) {
        if (!channelDef) {
            continue;
        }

        const channelWithScale =
            ((isChannelDefWithScale(channelDef) &&
                channelDef.resolutionChannel) ??
                (isChannelWithScale(channel) && channel)) ||
            undefined;

        const resolution = mark.unitView.getScaleResolution(channelWithScale);

        encoders[channel] = createEncoder(
            encoding[channel],
            resolution?.getScale(),
            mark.unitView.getAccessor(channel),
            channel
        );
    }

    return encoders;
}

/**
 *
 * @param {import("../spec/channel").ChannelDef} channelDef
 * @param {any} scale
 * @param {import("./accessor").Accessor} accessor
 * @param {Channel} channel
 * @returns {Encoder}
 */
export function createEncoder(channelDef, scale, accessor, channel) {
    /** @type {Encoder} */
    let encoder;

    if (isValueDef(channelDef)) {
        const value = channelDef.value;
        encoder = /** @type {Encoder} */ ((datum) => value);
        encoder.constant = true;
        encoder.constantValue = true;
        encoder.accessor = undefined;
    } else if (accessor) {
        if (channel == "text") {
            // TODO: Define somewhere channels that don't use a scale
            encoder = /** @type {Encoder} */ ((datum) => undefined);
            encoder.accessor = accessor;
            encoder.constant = accessor.constant;
        } else {
            if (!scale) {
                if (!isChannelWithScale(channel)) {
                    // Channels like uniqueId are passed as is.
                    scale = scaleNull();
                } else {
                    throw new Error(
                        `Missing scale! "${channel}": ${JSON.stringify(
                            channelDef
                        )}`
                    );
                }
            }

            encoder = /** @type {Encoder} */ (
                (datum) => scale(accessor(datum))
            );

            if (isDiscrete(scale.type)) {
                // TODO: pass the found values back to the scale/resolution
                const indexer = createIndexer();
                indexer.addAll(scale.domain());
                encoder.indexer = indexer;
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
        ? (value) => scale.invert(value)
        : (value) => {
              throw new Error(
                  "No scale available, cannot invert: " +
                      JSON.stringify(channelDef)
              );
          };

    // Just to provide a convenient access to the config
    encoder.channelDef = channelDef;

    /** @param {Encoder} target */
    encoder.applyMetadata = (target) => {
        for (const prop in encoder) {
            if (prop in encoder) {
                // @ts-ignore
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
 * @param {import("../spec/channel").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel").ValueDef}
 */
export function isValueDef(channelDef) {
    return channelDef && "value" in channelDef;
}

/**
 * @param {import("../spec/channel").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel").FieldDefBase<string>}
 */
export function isFieldDef(channelDef) {
    return channelDef && "field" in channelDef;
}

/**
 * @param {import("../spec/channel").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel").DatumDef}
 */
export function isDatumDef(channelDef) {
    return channelDef && "datum" in channelDef;
}

/**
 * @param {import("../spec/channel").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel").ChannelDefWithScale}
 */
export function isChannelDefWithScale(channelDef) {
    // TODO: Not accurate, fix
    return (
        isFieldDef(channelDef) ||
        isDatumDef(channelDef) ||
        isExprDef(channelDef) ||
        isChromPosDef(channelDef)
    );
}

/**
 * @param {import("../view/unitView").default} view
 * @param {Channel} channel
 */
export function getChannelDefWithScale(view, channel) {
    const channelDef = view.mark.encoding[channel];
    if (isChannelDefWithScale(channelDef)) {
        return channelDef;
    } else {
        throw new Error("Not a channel def with scale!");
    }
}

/**
 * @param {import("../spec/channel").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel").ChromPosDef}
 */
export function isChromPosDef(channelDef) {
    return channelDef && "chrom" in channelDef;
}

/**
 * @param {import("../spec/channel").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel").ExprDef}
 */
export function isExprDef(channelDef) {
    return channelDef && "expr" in channelDef;
}

/**
 * @type {import("../spec/channel").PrimaryPositionalChannel[]}
 */
export const primaryPositionalChannels = ["x", "y"];

/**
 * @type {import("../spec/channel").SecondaryPositionalChannel[]}
 */
export const secondaryPositionalChannels = ["x2", "y2"];

/**
 * @type {import("../spec/channel").PositionalChannel[]}
 */
export const positionalChannels = [
    ...primaryPositionalChannels,
    ...secondaryPositionalChannels,
];

/**
 * @param {Channel} channel
 * @returns {channel is import("../spec/channel").PrimaryPositionalChannel}
 */
export function isPrimaryPositionalChannel(channel) {
    // @ts-expect-error
    return primaryPositionalChannels.includes(channel);
}

/**
 * @param {Channel} channel
 * @returns {channel is import("../spec/channel").PositionalChannel}
 */
export function isPositionalChannel(channel) {
    // @ts-expect-error
    return positionalChannels.includes(channel);
}

/**
 * Map primary channels to secondarys
 *
 * @type {Partial<Record<Channel, import("../spec/channel").SecondaryPositionalChannel>>}
 */
export const secondaryChannels = {
    x: "x2",
    y: "y2",
};

/**
 * Map secondary channels to primaries
 *
 * @type {Partial<Record<Channel, Channel>>}
 */
export const primaryChannels = Object.fromEntries(
    Object.entries(secondaryChannels).map((entry) => [entry[1], entry[0]])
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
 * @param {Channel} primaryChannel
 */
export function getSecondaryChannel(primaryChannel) {
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
 * @param {Channel} channel
 */
export function getPrimaryChannel(channel) {
    return primaryChannels[channel] ?? channel;
}

/**
 * Returns an array that contains the given channel and its secondary channel if one exists.
 *
 * @param {Channel} channel
 */
export function getChannelWithSecondarys(channel) {
    return secondaryChannels[channel]
        ? [channel, secondaryChannels[channel]]
        : [channel];
}

/**
 * @param {Channel} channel
 */
export function isColorChannel(channel) {
    return ["color", "fill", "stroke"].includes(getPrimaryChannel(channel));
}

/**
 * Returns true if the channel has a discrete range.
 *
 * @param {Channel} channel
 */
export function isDiscreteChannel(channel) {
    return ["shape", "squeeze"].includes(channel);
}

/**
 * @param {Channel} channel
 * @returns {channel is import("../spec/channel").ChannelWithScale}
 */
export function isChannelWithScale(channel) {
    return [
        "x",
        "y",
        "x2",
        "y2",
        "color",
        "fill",
        "stroke",
        "opacity",
        "fillOpacity",
        "strokeOpacity",
        "strokeWidth",
        "size",
        "shape",
        "angle",
        "dx",
        "dy",
        "sample",
    ].includes(channel);
}

/**
 * Returns valid discrete values for a discrete channel.
 *
 * @param {Channel} channel
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
                "triangle-left",
            ];
        default:
    }
}

/**
 * @param {Channel} channel
 * @returns {function(any):number}
 */
export function getDiscreteRangeMapper(channel) {
    if (!isDiscreteChannel(channel)) {
        throw new Error("Not a discrete channel: " + channel);
    }

    const valueMap = new Map(
        getDiscreteRange(channel).map((value, i) => [value, i])
    );

    return (value) => {
        const mapped = valueMap.get(value);
        if (mapped !== undefined) {
            return mapped;
        }
        throw new Error(`Invalid value for "${channel}" channel: ${value}`);
    };
}
