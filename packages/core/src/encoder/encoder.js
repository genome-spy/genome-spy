import {
    isIntervalSelection,
    makeSelectionTestExpression,
} from "../selection/selection.js";
import { createConditionalAccessors } from "./accessor.js";

/**
 * TODO: Complete this. Not tested yet.
 *
 * Creates a selection predicate that can be used in conditional encoding.
 *
 * @param {string} param
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {import("../view/paramMediator.js").default} paramMediator
 * @param {boolean} empty
 */
// eslint-disable-next-line no-unused-vars
function createSelectionPredicate(param, encoding, paramMediator, empty) {
    const selection =
        /** @type {import("../types/selectionTypes.js").Selection} */ (
            paramMediator.findValue(param)
        );
    if (!selection) {
        throw new Error(`No selection parameter found: ${param}`);
    }

    /** @type {Partial<Record<import("../spec/channel.js").PositionalChannel, import("../spec/channel.js").Field>>} */
    const fields = {};
    if (isIntervalSelection(selection)) {
        const channels = Object.keys(selection.intervals);
        for (const channel of channels) {
            const channelDef = encoding[channel];
            if (isFieldDef(channelDef)) {
                fields[channel] = channelDef.field;
                continue;
            } else if ("condition" in channelDef) {
                const condition = channelDef.condition;
                if (isFieldDef(condition)) {
                    fields[channel] = condition.field;
                    continue;
                }
            }
            throw new Error(
                `Selection "${param}" has an interval for "${channel}" channel, but could not find a fieldDef: ${JSON.stringify(encoding[channel])}`
            );
        }
    }

    const expr = makeSelectionTestExpression(
        { type: "filter", param, fields, empty },
        selection
    );

    return paramMediator.createExpression(expr);
}

/**
 * Creates an object that contains encoders for every channel of a mark
 *
 * TODO: This method should have a test. But how to mock Mark...
 *
 * @param {import("../view/unitView.js").default} unitView
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {Partial<Record<Channel, Encoder>>}
 */
export default function createEncoders(unitView, encoding) {
    /**
     * @typedef {import("../spec/channel.js").Channel} Channel
     * @typedef {import("../types/encoder.js").Encoder} Encoder
     */

    /** @type {Partial<Record<Channel, Encoder>>} */
    const encoders = {};

    /**
     * @param {import("../spec/channel.js").ChannelWithScale} channel */
    const scaleSource = (channel) =>
        unitView.getScaleResolution(channel)?.getScale();

    for (const [channel, channelDef] of Object.entries(encoding)) {
        if (!channelDef) {
            continue;
        }

        /** @type {Channel} */
        const typedChannel = /** @type {Channel} */ (channel);
        if (isNonMarkPropertyChannel(typedChannel)) {
            continue;
        }

        const typedChannelDef =
            /** @type {import("../spec/channel.js").ChannelDef} */ (channelDef);
        encoders[typedChannel] = createSimpleOrConditionalEncoder(
            createConditionalAccessors(
                typedChannel,
                typedChannelDef,
                unitView.paramRuntime
            ),
            scaleSource
        );
    }

    return encoders;
}

/**
 * Channels that are present in encoding but are not direct mark properties.
 * Keep this centralized so metadata channels (for example tooltip) can reuse
 * the same handling path.
 *
 * @param {import("../spec/channel.js").Channel} channel
 * @returns {boolean}
 */
export function isNonMarkPropertyChannel(channel) {
    return channel === "key" || channel === "search";
}

/**
 * @param {import("../types/encoder.js").Accessor[]} accessors
 * @param {(channel: import("../spec/channel.js").ChannelWithScale) => import("../types/encoder.js").VegaScale} scaleSource
 * @returns {Encoder}
 */
export function createSimpleOrConditionalEncoder(accessors, scaleSource) {
    /**
     * @typedef {import("../types/encoder.js").Encoder} Encoder
     * @typedef {import("../types/encoder.js").Accessor} Accessor
     * @typedef {import("../data/flowNode.js").Datum} Datum
     */
    if (accessors.length === 1) {
        return createEncoder(accessors[0], scaleSource);
    }

    const predicates = accessors.map((a) => a.predicate);

    const encoders = accessors.map((a) => createEncoder(a, scaleSource));

    const encoder = Object.assign(
        (/** @type {Datum} */ datum) => {
            for (let i = 0; i < encoders.length; i++) {
                if (predicates[i](datum)) {
                    return encoders[i](datum);
                }
            }
        },
        {
            constant: false,
            accessors: /** @type {Accessor[]} */ (
                encoders.map((e) => e.accessors[0])
            ),
            dataAccessor: encoders.map((e) => e.dataAccessor).find((a) => a),
            scale: encoders.map((e) => e.scale).find((s) => s),
            channelDef: accessors.at(-1).channelDef,
        }
    );

    return encoder;
}

/**
 * @param {Accessor} accessor
 * @param {(channel: import("../spec/channel.js").ChannelWithScale) => import("../types/encoder.js").VegaScale} scaleSource
 * @returns {Encoder}
 */
export function createEncoder(accessor, scaleSource) {
    /**
     * @typedef {import("../types/encoder.js").Encoder} Encoder
     * @typedef {import("../types/encoder.js").Accessor} Accessor
     * @typedef {import("../data/flowNode.js").Datum} Datum
     */

    const { channel, scaleChannel, channelDef } = accessor;

    const scale = accessor.scaleChannel ? scaleSource(scaleChannel) : undefined;

    if (scaleChannel && !scale) {
        throw new Error(
            `Missing scale! "${channel}": ${JSON.stringify(channelDef)}`
        );
    }

    return Object.assign(
        scale
            ? (/** @type {Datum} */ datum) =>
                  scale(
                      // @ts-ignore Bad d3 types
                      accessor(datum)
                  )
            : (/** @type {Datum} */ datum) => accessor(datum),
        {
            scale,
            constant: accessor.constant,
            accessors: [accessor],
            dataAccessor: accessor.constant ? undefined : accessor,
            // TODO: Accessor already has the channelDef
            channelDef,
        }
    );
}

/**
 * TODO: Move to a more generic place
 *
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").ValueDef}
 */
export function isValueDef(channelDef) {
    return channelDef && "value" in channelDef;
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").FieldDefBase}
 */
export function isFieldDef(channelDef) {
    return channelDef && "field" in channelDef;
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").DatumDef}
 */
export function isDatumDef(channelDef) {
    return channelDef && "datum" in channelDef;
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").ChannelDefWithScale}
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
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 */
export function findChannelDefWithScale(channelDef) {
    if (isValueDefWithCondition(channelDef)) {
        const condition = channelDef.condition;
        if (!Array.isArray(condition) && isChannelDefWithScale(condition)) {
            return condition;
        }
    } else if (isChannelDefWithScale(channelDef)) {
        return channelDef;
    }
}

/**
 * @param {import("../view/unitView.js").default} view
 * @param {import("../spec/channel.js").Channel} channel
 */
export function getChannelDefWithScale(view, channel) {
    const channelDef = view.mark.encoding[channel];
    if (!Array.isArray(channelDef) && isChannelDefWithScale(channelDef)) {
        return channelDef;
    } else {
        throw new Error("Not a channel def with scale!");
    }
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").TypeMixins<import("../spec/channel.js").Type>}
 */
export function isChannelDefWithType(channelDef) {
    return channelDef && "type" in channelDef;
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").ChromPosDef}
 */
export function isChromPosDef(channelDef) {
    return channelDef && "chrom" in channelDef;
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").ExprDef}
 */
export function isExprDef(channelDef) {
    return channelDef && "expr" in channelDef;
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").FieldOrDatumDefWithCondition}
 */
export function isFieldOrDatumDefWithCondition(channelDef) {
    return (
        (isFieldDef(channelDef) || isDatumDef(channelDef)) &&
        "condition" in channelDef
    );
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").ValueDefWithCondition}
 */
export function isValueDefWithCondition(channelDef) {
    return isValueDef(channelDef) && "condition" in channelDef;
}

/**
 * @type {import("../spec/channel.js").PrimaryPositionalChannel[]}
 */
export const primaryPositionalChannels = ["x", "y"];

/**
 * @type {import("../spec/channel.js").SecondaryPositionalChannel[]}
 */
export const secondaryPositionalChannels = ["x2", "y2"];

/**
 * @type {import("../spec/channel.js").PositionalChannel[]}
 */
export const positionalChannels = [
    ...primaryPositionalChannels,
    ...secondaryPositionalChannels,
];

/**
 * @param {import("../spec/channel.js").Channel} channel
 * @returns {channel is import("../spec/channel.js").PrimaryPositionalChannel}
 */
export function isPrimaryPositionalChannel(channel) {
    // @ts-expect-error
    return primaryPositionalChannels.includes(channel);
}

/**
 * @param {import("../spec/channel.js").Channel} channel
 * @returns {channel is import("../spec/channel.js").PositionalChannel}
 */
export function isPositionalChannel(channel) {
    // @ts-expect-error
    return positionalChannels.includes(channel);
}

/**
 * Map primary channels to secondarys
 *
 * @type {Partial<Record<import("../spec/channel.js").Channel, import("../spec/channel.js").SecondaryPositionalChannel>>}
 */
export const secondaryChannels = {
    x: "x2",
    y: "y2",
};

/**
 * Map secondary channels to primaries
 *
 * @type {Partial<Record<import("../spec/channel.js").Channel, import("../spec/channel.js").Channel>>}
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
 * @param {import("../spec/channel.js").Channel} primaryChannel
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
 * @param {import("../spec/channel.js").Channel} channel
 */
export function getPrimaryChannel(channel) {
    return primaryChannels[channel] ?? channel;
}

/**
 * Returns an array that contains the given channel and its secondary channel if one exists.
 *
 * @param {import("../spec/channel.js").Channel} channel
 */
export function getChannelWithSecondarys(channel) {
    return secondaryChannels[channel]
        ? [channel, secondaryChannels[channel]]
        : [channel];
}

/**
 * @param {import("../spec/channel.js").Channel} channel
 */
export function isColorChannel(channel) {
    return ["color", "fill", "stroke"].includes(getPrimaryChannel(channel));
}

/**
 * Returns true if the channel has a discrete range.
 *
 * @param {import("../spec/channel.js").Channel} channel
 */
export function isDiscreteChannel(channel) {
    return ["shape"].includes(channel);
}

/**
 * @param {import("../spec/channel.js").Channel} channel
 * @returns {channel is import("../spec/channel.js").ChannelWithScale}
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
        "sample", // There's no scale but we need the data domain
    ].includes(channel);
}

/**
 * Returns valid discrete values for a discrete channel.
 *
 * @param {import("../spec/channel.js").Channel} channel
 * @returns {any[]}
 */
export function getDiscreteRange(channel) {
    // TODO: This is not easily extendable. Figure out a more dynamic approach.
    switch (channel) {
        case "shape":
            return [
                "circle",
                "square",
                "cross",
                "diamond",
                "triangle-up",
                "triangle-right",
                "triangle-down",
                "triangle-left",
                "tick-up",
                "tick-right",
                "tick-down",
                "tick-left",
            ];
        default:
    }
}

/**
 * @param {import("../spec/channel.js").Channel} channel
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
        // TODO: Memoize previous
        const mapped = valueMap.get(value);
        if (mapped !== undefined) {
            return mapped;
        }
        throw new Error(`Invalid value for "${channel}" channel: ${value}`);
    };
}
