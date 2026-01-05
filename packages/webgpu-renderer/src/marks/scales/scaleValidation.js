import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import { isScaleSupported } from "./scaleDefs.js";

/**
 * @param {import("../../index.d.ts").ChannelConfigInput} channel
 * @param {boolean} rangeIsFunction
 * @param {boolean} rangeIsColor
 * @returns {boolean}
 */
function isInterpolationEnabled(channel, rangeIsFunction, rangeIsColor) {
    return (
        rangeIsFunction ||
        channel.scale?.interpolate !== undefined ||
        rangeIsColor
    );
}

/**
 * @param {import("../../index.d.ts").ScaleDef | undefined} scaleDef
 * @param {boolean} interpolateEnabled
 * @returns {boolean}
 */
function allowsVectorOutput(scaleDef, interpolateEnabled) {
    const vectorOutputMode = scaleDef?.vectorOutput ?? "never";
    return (
        vectorOutputMode === "always" ||
        (vectorOutputMode === "interpolated" && interpolateEnabled)
    );
}

/**
 * @param {import("../../types.js").ScalarType} type
 * @returns {boolean}
 */
function isNumericScalarType(type) {
    return type === "f32" || type === "u32" || type === "i32";
}

/**
 * @param {string} name
 * @param {import("../../index.d.ts").ChannelConfigInput} channel
 * @param {ReturnType<typeof buildChannelAnalysis> | undefined} [analysis]
 * @returns {string | null}
 */
export function validateScaleConfig(name, channel, analysis) {
    const resolved = analysis ?? buildChannelAnalysis(name, channel);
    const {
        scaleType,
        outputComponents,
        inputComponents,
        allowsScalarToVector,
        isContinuousScale,
        rangeIsFunction,
        rangeIsColor,
        isPiecewise,
        needsDomainMap,
        scalarType,
        outputScalarType,
        scaleDef,
    } = resolved;

    if (scaleType !== "identity" && !isScaleSupported(scaleType)) {
        return `Channel "${name}" uses unsupported scale "${scaleType}".`;
    }

    const interpolateEnabled = isInterpolationEnabled(
        channel,
        rangeIsFunction,
        rangeIsColor
    );
    const allowsVectorOutputFlag = allowsVectorOutput(
        scaleDef,
        interpolateEnabled
    );
    const allowsScalarToVectorOutput =
        allowsVectorOutputFlag && allowsScalarToVector;
    const vectorOutputAllowed =
        outputComponents === 1 ||
        (scaleType === "identity"
            ? inputComponents === outputComponents
            : allowsVectorOutputFlag);
    if (outputComponents > 1 && !vectorOutputAllowed) {
        return `Channel "${name}" uses vector components but scale "${scaleType}" only supports scalars.`;
    }

    if (rangeIsFunction && !isContinuousScale) {
        return `Channel "${name}" only supports function ranges with continuous scales.`;
    }
    if (rangeIsFunction && outputComponents !== 4) {
        return `Channel "${name}" requires vec4 outputs when using function ranges.`;
    }
    if (channel.scale?.interpolate !== undefined) {
        if (!rangeIsColor) {
            return `Channel "${name}" requires a color range when interpolate is set.`;
        }
        if (!isContinuousScale) {
            return `Channel "${name}" only supports color interpolation with continuous scales.`;
        }
        if (outputComponents !== 4) {
            return `Channel "${name}" requires vec4 outputs when interpolate is set.`;
        }
    }
    if (
        isContinuousScale &&
        !rangeIsFunction &&
        rangeIsColor &&
        outputComponents !== 4
    ) {
        return `Channel "${name}" requires vec4 outputs when using color ranges.`;
    }

    const inputRule = scaleDef?.input ?? "any";
    if (inputRule === "numeric" && !isNumericScalarType(scalarType)) {
        return `Channel "${name}" requires numeric input for "${scaleType}" scale.`;
    }
    if (inputRule === "u32" && scalarType !== "u32") {
        return `Channel "${name}" requires u32 input for "${scaleType}" scale.`;
    }

    if (
        outputComponents > 1 &&
        scalarType !== "f32" &&
        !allowsScalarToVectorOutput
    ) {
        return `Only f32 vectors are supported for "${name}" right now.`;
    }

    const allowsPackedScalarInput =
        inputComponents === 2 &&
        outputComponents === 1 &&
        scalarType === "u32" &&
        scaleType === "index";
    if (
        inputComponents > 1 &&
        scalarType !== "f32" &&
        !allowsPackedScalarInput
    ) {
        return `Only f32 vectors are supported for "${name}" input data.`;
    }
    if (
        inputComponents !== outputComponents &&
        !allowsScalarToVectorOutput &&
        !allowsPackedScalarInput
    ) {
        return `Channel "${name}" only supports mismatched input/output components when mapping scalars to vectors.`;
    }

    const customError = scaleDef?.validate?.({
        name,
        channel,
        scaleType,
        outputComponents,
        inputComponents,
        scalarType,
        outputScalarType,
        isPiecewise,
        needsDomainMap,
        allowsScalarToVector,
        isContinuousScale,
        rangeIsFunction,
        rangeIsColor,
    });
    if (customError) {
        return customError;
    }

    return null;
}
