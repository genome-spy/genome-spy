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
 */

/** @typedef {import("../../index.d.ts").ScaleIOContext} ScaleIOContext */

/** @typedef {"series"|"value"|"missing"} ChannelSourceKind */

/**
 * @typedef {ScaleIOContext & {
 *   name: string,
 *   channel: ChannelConfigInput,
 *   sourceKind: ChannelSourceKind,
 *   scaleType: ScaleType,
 *   scaleDef: import("../scales/scaleDefs.js").ScaleDef,
 *   useRangeTexture: boolean,
 *   isPiecewise: boolean,
 *   needsScaleFunction: boolean,
 *   needsOrdinalRange: boolean,
 *   needsDomainMap: boolean,
 *   stopKind: import("../../index.d.ts").ScaleStopKind | null,
 *   interpolateEnabled: boolean,
 *   allowsScalarToVector: boolean,
 *   isContinuousScale: boolean,
 *   rangeIsFunction: boolean,
 *   rangeIsColor: boolean
 * }} ChannelAnalysis
 *   Normalized channel metadata shared by validation and code generation.
 *   Includes ScaleIOContext fields (inputComponents, outputComponents,
 *   scalarType, outputScalarType).
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
        scaleType !== "identity" ||
        isPiecewise ||
        useRangeTexture ||
        outputComponents !== inputComponents;
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
        interpolateEnabled,
        allowsScalarToVector,
        isContinuousScale: continuous,
        rangeIsFunction,
        rangeIsColor,
    };
}
