import {
    isIntervalSelection,
    makeSelectionTestExpression,
} from "../selection/selection.js";
import { createAccessor } from "./accessor.js";
import { makeConstantExprRef } from "../paramRuntime/paramUtils.js";

/**
 * Creates a host-side predicate for selection-driven conditional encoding.
 * The selection test expression is compiled lazily when the predicate is
 * first evaluated so encoder construction does not depend on eager selection
 * materialization.
 *
 * @param {string} param
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {{ findValue: (param: string) => any, createExpression: (expr: string) => import("../paramRuntime/types.js").ExprRefFunction }} paramRuntime
 * @param {boolean} empty
 * @returns {import("../types/encoder.js").Predicate}
 */
export function createSelectionPredicate(param, encoding, paramRuntime, empty) {
    /**
     * @typedef {import("../data/flowNode.js").Datum} Datum
     * @typedef {import("../types/selectionTypes.js").Selection} Selection
     * @typedef {import("../types/encoder.js").Predicate} Predicate
     */

    /** @type {import("../paramRuntime/types.js").ExprRefFunction | undefined} */
    let compiled;

    const fallback = makeConstantExprRef(false);

    const ensureCompiled = () => {
        if (compiled) {
            return compiled;
        }

        const selection = /** @type {Selection | undefined} */ (
            paramRuntime.findValue(param)
        );
        if (!selection) {
            return fallback;
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
                } else if (channelDef && "condition" in channelDef) {
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

        compiled = paramRuntime.createExpression(expr);
        return compiled;
    };

    /** @type {Predicate} */
    const predicate = Object.assign(
        /** @param {Datum} datum */ (datum) => ensureCompiled()(datum),
        {
            param,
            empty: empty ?? true,
        }
    );

    return predicate;
}

/**
 * Creates ordered conditional branches for a channel definition. The last
 * branch is always the fallback branch.
 *
 * @param {import("../spec/channel.js").Channel} channel
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {{ createExpression: (expr: string) => import("../paramRuntime/types.js").ExprRefFunction, findValue: (param: string) => any }} paramRuntime
 * @returns {import("../types/encoder.js").EncodingBranch[]}
 */
export function createConditionalBranches(
    channel,
    channelDef,
    encoding,
    paramRuntime
) {
    const conditions =
        isFieldOrDatumDefWithCondition(channelDef) ||
        isValueDefWithCondition(channelDef)
            ? Array.isArray(channelDef.condition)
                ? channelDef.condition
                : [channelDef.condition]
            : [];

    const branchChannelDefs = [...conditions, channelDef];

    /** @type {import("../types/encoder.js").EncodingBranch[]} */
    const branches = branchChannelDefs.map((branchChannelDef, index) => {
        const condition = conditions[index];
        const accessor = createAccessor(
            channel,
            branchChannelDef,
            paramRuntime
        );

        /** @type {import("../types/encoder.js").Predicate} */
        const predicate = condition?.param
            ? createSelectionPredicate(
                  condition.param,
                  encoding,
                  paramRuntime,
                  condition.empty
              )
            : Object.assign(
                  makeConstantExprRef(index === branchChannelDefs.length - 1),
                  {
                      empty: false,
                  }
              );

        return {
            accessor,
            predicate,
        };
    });

    if (branches.filter((branch) => !branch.accessor.constant).length > 1) {
        throw new Error(
            "Only one accessor can be non-constant. Channel: " + channel
        );
    }

    return branches;
}

/**
 * Creates encoders for direct mark-property channels in an encoding object.
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
            createConditionalBranches(
                typedChannel,
                typedChannelDef,
                encoding,
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
 * @param {import("../types/encoder.js").Encoder} encoder
 * @returns {import("../types/encoder.js").Accessor[]}
 */
export function getEncoderAccessors(encoder) {
    return encoder.branches.map((branch) => branch.accessor);
}

/**
 * @param {import("../types/encoder.js").Encoder} encoder
 * @returns {import("../types/encoder.js").Accessor | undefined}
 */
export function getEncoderDataAccessor(encoder) {
    return encoder.branches.find((branch) => !branch.accessor.constant)
        ?.accessor;
}

/**
 * Creates an encoder from ordered branches. The first matching branch wins.
 *
 * @param {import("../types/encoder.js").EncodingBranch[]} branches
 * @param {(channel: import("../spec/channel.js").ChannelWithScale) => import("../types/encoder.js").VegaScale} scaleSource
 * @returns {Encoder}
 */
export function createSimpleOrConditionalEncoder(branches, scaleSource) {
    /**
     * @typedef {import("../types/encoder.js").Encoder} Encoder
     * @typedef {import("../data/flowNode.js").Datum} Datum
     */
    if (branches.length === 1) {
        const encoder = createEncoder(branches[0].accessor, scaleSource);
        return Object.assign(encoder, {
            branches,
        });
    }

    const predicates = branches.map((branch) => branch.predicate);

    const encoders = branches.map((branch) =>
        createEncoder(branch.accessor, scaleSource)
    );

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
            branches,
            scale: encoders.map((e) => e.scale).find((s) => s),
            channelDef: branches.at(-1).accessor.channelDef,
        }
    );

    return encoder;
}

/**
 * Wraps a single accessor with optional scale application and encoder metadata.
 *
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
            branches: [
                {
                    accessor,
                    predicate: makeConstantExprRef(true),
                },
            ],
            channelDef,
        }
    );
}

/**
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
 * Returns true for direct channel definitions that participate in scale
 * resolution. Conditional wrappers must be unwrapped by the caller first.
 *
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").ChannelDefWithScale}
 */
export function isChannelDefWithScale(channelDef) {
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
