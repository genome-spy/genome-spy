import {
    isColorRange,
    isRangeFunction,
    usesRangeTexture,
} from "../scales/scaleStops.js";
import { isPiecewiseScale } from "../scales/scaleUtils.js";
import {
    getScaleDef,
    getScaleOutputType,
    getScaleResourceRequirements,
    isContinuousScale,
} from "../scales/scaleDefs.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("../../index.d.ts").ChannelScale["type"]} ScaleType
 * @typedef {import("../../types.js").ScalarType} ScalarType
 *
 * @typedef {"series"|"value"|"missing"} ChannelSourceKind
 *
 * @typedef {object} ChannelAnalysis
 *   Normalized channel metadata shared by validation and code generation.
 * @prop {string} name
 *   Channel name used for diagnostics and resource bookkeeping.
 * @prop {ChannelConfigInput} channel
 *   Original channel config used to derive the analysis.
 * @prop {ChannelSourceKind} sourceKind
 *   Whether the channel provides series data, a value, or neither.
 * @prop {ScaleType} scaleType
 *   Scale type to be used for codegen and validation.
 * @prop {import("../scales/scaleDefs.js").ScaleDef} scaleDef
 *   Metadata from the scale registry (input/output rules, flags).
 * @prop {1|2|4} outputComponents
 *   Vector width expected by the mark shader for the scaled output.
 * @prop {1|2|4} inputComponents
 *   Vector width of the raw input value before scaling.
 * @prop {"f32"|"u32"|"i32"} scalarType
 *   Scalar type of the raw input when inputComponents is 1.
 * @prop {"f32"|"u32"|"i32"} outputScalarType
 *   Scalar type of the scaled output when outputComponents is 1.
 * @prop {boolean} useRangeTexture
 *   True when the scale output is sampled from a ramp texture.
 * @prop {boolean} isPiecewise
 *   True when the scale uses piecewise domain/range arrays.
 * @prop {boolean} needsScaleFunction
 *   True when a getScaled_* helper is required.
 * @prop {boolean} needsOrdinalRange
 *   True when the ordinal range buffer must be bound.
 * @prop {boolean} needsDomainMap
 *   True when an ordinal domain map buffer must be bound.
 * @prop {import("../../index.d.ts").ScaleStopKind | null} stopKind
 *   Stop-array kind used for uniform-backed domain/range allocation; null
 *   means the scale uses buffer/texture resources instead.
 * @prop {boolean} allowsScalarToVector
 *   True when scalar inputs can map to vector outputs for this scale.
 * @prop {boolean} isContinuousScale
 *   True for continuous scales like linear/log/pow/sqrt/symlog.
 * @prop {boolean} rangeIsFunction
 *   True when the range is an interpolator function.
 * @prop {boolean} rangeIsColor
 *   True when the range is an array of color values.
 */

/**
 * @param {ScalarType | undefined} type
 * @returns {"f32"|"u32"|"i32"}
 */
export function normalizeScalarType(type) {
    return type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";
}

/**
 * @param {ChannelConfigInput} channel
 * @returns {ChannelSourceKind}
 */
function getSourceKind(channel) {
    if (channel.data != null) {
        return "series";
    }
    if (channel.value != null || channel.default != null) {
        return "value";
    }
    return "missing";
}

/**
 * @param {string} name
 * @param {ChannelConfigInput} channel
 * @returns {ChannelAnalysis}
 */
export function buildChannelAnalysis(name, channel) {
    const sourceKind = getSourceKind(channel);
    /** @type {ScaleType} */
    const scaleType = channel.scale?.type ?? "identity";
    const scaleDef = getScaleDef(scaleType);
    const outputComponents = channel.components ?? 1;
    const scalarType = normalizeScalarType(channel.type);
    const outputScalarType =
        outputComponents === 1
            ? getScaleOutputType(scaleType, scalarType)
            : "f32";
    const defaultInputComponents =
        sourceKind === "series" || scaleType === "identity"
            ? outputComponents
            : 1;
    const inputComponents = channel.inputComponents ?? defaultInputComponents;
    const range = channel.scale?.range;
    const rangeIsFunction = isRangeFunction(range);
    const rangeIsColor = isColorRange(
        /** @type {Array<number|number[]|string>|undefined} */ (range)
    );
    const interpolateEnabled =
        rangeIsFunction ||
        channel.scale?.interpolate !== undefined ||
        rangeIsColor;
    const useRangeTexture = usesRangeTexture(channel.scale, outputComponents);
    const isPiecewise = isPiecewiseScale(channel.scale);
    const resourceRequirements = getScaleResourceRequirements(
        scaleType,
        isPiecewise
    );
    const needsScaleFunction =
        outputComponents === 1 ||
        scaleType !== "identity" ||
        isPiecewise ||
        useRangeTexture;
    const needsOrdinalRange = resourceRequirements.needsOrdinalRange;
    const needsDomainMap = resourceRequirements.needsDomainMap;
    const continuous = isContinuousScale(scaleType);
    const vectorOutputMode = scaleDef.vectorOutput ?? "never";
    const allowsScalarToVector =
        outputComponents > 1 &&
        inputComponents === 1 &&
        scaleType !== "identity" &&
        (vectorOutputMode === "always" ||
            (vectorOutputMode === "interpolated" && interpolateEnabled));

    return {
        name,
        channel,
        sourceKind,
        scaleType,
        scaleDef,
        outputComponents,
        inputComponents,
        scalarType,
        outputScalarType,
        useRangeTexture,
        isPiecewise,
        needsScaleFunction,
        needsOrdinalRange,
        needsDomainMap,
        stopKind: resourceRequirements.stopKind,
        allowsScalarToVector,
        isContinuousScale: continuous,
        rangeIsFunction,
        rangeIsColor,
    };
}
