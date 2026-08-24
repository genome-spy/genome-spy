import { formatLiteral } from "../../wgsl/literals.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../index.d.ts").ChannelScale["type"]} ScaleType
 * @typedef {import("../../types.js").ScalarType} ScalarType
 * @typedef {ReturnType<typeof import("./channelAnalysis.js").buildChannelAnalysis>} ChannelAnalysis
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
 * @prop {import("../../index.d.ts").ScaleDef} scaleDef
 *   Imported behavior used by scale code generation and resource planning.
 * @prop {boolean} useRangeTexture
 *   True when the scale output is sampled from a color ramp texture.
 * @prop {boolean} needsScaleFunction
 *   True when a getScaled_* helper is required (non-identity or scalar output).
 * @prop {boolean} needsOrdinalRange
 *   True when the ordinal range buffer must be bound for this channel.
 * @prop {boolean} needsDomainMap
 *   True when the ordinal domain map buffer must be bound for this channel.
 *
 * @typedef {object} CompiledMarkChannels
 * @prop {Record<string, ChannelConfigResolved>} channels
 * @prop {ReadonlyMap<string, ChannelAnalysis>} analysisByChannel
 * @prop {ChannelIR[]} channelIRs
 * @prop {ReadonlySet<string>} channelNames
 * @prop {ReadonlySet<string>} inputNames
 */

/**
 * @param {ChannelAnalysis} analysis
 * @returns {ChannelIR | null}
 */
function buildChannelIR(analysis) {
    if (analysis.sourceKind === "missing") {
        return null;
    }
    const {
        name,
        outputComponents,
        inputComponents,
        scalarType,
        outputScalarType,
        scaleType,
        scaleDef,
        useRangeTexture,
        needsScaleFunction,
        needsOrdinalRange,
        needsDomainMap,
    } = analysis;
    const channel = /** @type {ChannelConfigResolved} */ (analysis.channel);

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
            scaleDef,
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
        scaleDef,
        useRangeTexture,
        needsScaleFunction,
        needsOrdinalRange,
        needsDomainMap,
    };
}

/**
 * @param {ReadonlyMap<string, ChannelAnalysis>} analysisByChannel
 * @returns {ChannelIR[]}
 */
function buildChannelIRs(analysisByChannel) {
    /** @type {ChannelIR[]} */
    const channelIRs = [];

    for (const analysis of analysisByChannel.values()) {
        const channelIR = buildChannelIR(analysis);
        if (!channelIR) {
            continue;
        }
        channelIRs.push(channelIR);
    }

    return channelIRs;
}

/**
 * Build the channel views shared by shader and resource setup.
 *
 * @param {object} params
 * @param {Record<string, ChannelConfigResolved>} params.channels
 * @param {ReadonlyMap<string, ChannelAnalysis>} params.analysisByChannel
 * @param {ReadonlySet<string>} params.channelNames
 * @param {ReadonlySet<string>} params.inputNames
 * @returns {CompiledMarkChannels}
 */
export function compileMarkChannels({
    channels,
    analysisByChannel,
    channelNames,
    inputNames,
}) {
    return {
        channels,
        analysisByChannel,
        channelIRs: buildChannelIRs(analysisByChannel),
        channelNames,
        inputNames,
    };
}
