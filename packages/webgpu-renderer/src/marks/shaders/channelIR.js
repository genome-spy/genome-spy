import { buildChannelAnalysis } from "./channelAnalysis.js";
import { formatLiteral } from "../scales/scaleCodegen.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../index.d.ts").ChannelScale["type"]} ScaleType
 * @typedef {import("../../types.js").ScalarType} ScalarType
 *
 * @typedef {"series"|"uniform"|"literal"} ChannelSourceKind
 *
 * @typedef {object} ChannelIR
 *   Resolved per-channel description used by shader generation and bindings.
 * @prop {string} name
 *   Channel name used for function naming and resource bookkeeping.
 * @prop {ChannelConfigResolved} channel
 *   Original resolved channel config; used for scale config lookups.
 * @prop {ChannelSourceKind} sourceKind
 *   Where the values originate: series buffer, uniform, or literal constant.
 * @prop {string} rawValueExpr
 *   WGSL expression that yields the raw (pre-scale) value for this channel.
 * @prop {"f32"|"u32"|"i32"} scalarType
 *   Scalar type of the raw input value when inputComponents is 1.
 * @prop {1|2|4} outputComponents
 *   Number of components expected by the mark shader (1 for scalars, 4 for colors).
 * @prop {1|2|4} inputComponents
 *   Number of components stored in the series buffer (defaults to outputComponents).
 * @prop {"f32"|"u32"|"i32"} outputScalarType
 *   Scalar type of the scaled output when outputComponents is 1.
 * @prop {ScaleType} scaleType
 *   Scale type name used by codegen (e.g., linear, band, threshold).
 * @prop {boolean} useRangeTexture
 *   True when the scale output is sampled from a color ramp texture.
 * @prop {boolean} needsScaleFunction
 *   True when a getScaled_* helper is required (non-identity or scalar output).
 * @prop {boolean} needsOrdinalRange
 *   True when the ordinal range buffer must be bound for this channel.
 * @prop {boolean} needsDomainMap
 *   True when the ordinal domain map buffer must be bound for this channel.
 */

/**
 * @param {string} name
 * @param {ChannelConfigResolved} channel
 * @returns {ChannelIR | null}
 */
function buildChannelIR(name, channel) {
    const analysis = buildChannelAnalysis(name, channel);
    if (analysis.sourceKind === "missing") {
        return null;
    }
    const {
        outputComponents,
        inputComponents,
        scalarType,
        outputScalarType,
        scaleType,
        useRangeTexture,
        needsScaleFunction,
        needsOrdinalRange,
        needsDomainMap,
    } = analysis;

    if (analysis.sourceKind === "series") {
        return {
            name,
            channel,
            sourceKind: "series",
            rawValueExpr: `read_${name}(i)`,
            scalarType,
            outputComponents,
            inputComponents,
            outputScalarType,
            scaleType,
            useRangeTexture,
            needsScaleFunction,
            needsOrdinalRange,
            needsDomainMap,
        };
    }

    const isDynamic = "dynamic" in channel && channel.dynamic === true;
    const resolvedValue =
        channel.value ?? /** @type {number|number[]} */ (channel.default);
    const literal = formatLiteral(scalarType, inputComponents, resolvedValue);
    const uniformName = `u_${name}`;
    const rawValueExpr = isDynamic ? `params.${uniformName}` : literal;

    return {
        name,
        channel,
        sourceKind: isDynamic ? "uniform" : "literal",
        rawValueExpr,
        scalarType,
        outputComponents,
        inputComponents,
        outputScalarType,
        scaleType,
        useRangeTexture,
        needsScaleFunction,
        needsOrdinalRange,
        needsDomainMap,
    };
}

/**
 * @param {Record<string, ChannelConfigResolved>} channels
 * @returns {ChannelIR[]}
 */
export function buildChannelIRs(channels) {
    /** @type {ChannelIR[]} */
    const channelIRs = [];

    for (const [name, channel] of Object.entries(channels)) {
        const channelIR = buildChannelIR(name, channel);
        if (!channelIR) {
            continue;
        }
        channelIRs.push(channelIR);
    }

    return channelIRs;
}
