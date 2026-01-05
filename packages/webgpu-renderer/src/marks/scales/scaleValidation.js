import { isValueChannelConfig } from "../../types.js";
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import { isScaleSupported } from "./scaleDefs.js";

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
    } = resolved;

    if (scaleType !== "identity" && !isScaleSupported(scaleType)) {
        return `Channel "${name}" uses unsupported scale "${scaleType}".`;
    }

    const interpolateEnabled =
        rangeIsFunction ||
        channel.scale?.interpolate !== undefined ||
        rangeIsColor;
    const allowsVectorOutput =
        scaleType === "identity" ||
        scaleType === "threshold" ||
        scaleType === "ordinal" ||
        scaleType === "linear" ||
        isPiecewise ||
        (interpolateEnabled && isContinuousScale);
    const allowsScalarToVectorOutput =
        allowsVectorOutput && allowsScalarToVector;
    if (outputComponents > 1 && !allowsVectorOutput) {
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

    if (
        (scaleType === "linear" || isPiecewise) &&
        outputComponents !== 1 &&
        outputComponents !== 4
    ) {
        return `Channel "${name}" uses ${outputComponents} components but linear scales only support scalars or vec4 outputs.`;
    }
    if (
        scaleType === "threshold" &&
        outputComponents !== 1 &&
        outputComponents !== 4
    ) {
        return `Channel "${name}" uses ${outputComponents} components but threshold scales only support scalars or vec4 outputs.`;
    }
    if (
        scaleType === "ordinal" &&
        outputComponents !== 1 &&
        outputComponents !== 4
    ) {
        return `Channel "${name}" uses ${outputComponents} components but ordinal scales only support scalars or vec4 outputs.`;
    }
    if (isPiecewise && outputComponents !== 1 && outputComponents !== 4) {
        return `Channel "${name}" uses ${outputComponents} components but piecewise scales only support scalars or vec4 outputs.`;
    }

    const inputRule = resolved.scaleDef?.input ?? "any";
    const type = channel.type ?? "f32";
    if (scaleType === "ordinal" && type !== "u32") {
        return `Channel "${name}" requires u32 input for "ordinal" scale.`;
    }
    if (inputRule === "numeric" && !["f32", "u32", "i32"].includes(type)) {
        return `Channel "${name}" requires numeric input for "${scaleType}" scale.`;
    }
    if (inputRule === "u32" && type !== "u32") {
        return `Channel "${name}" requires u32 input for "${scaleType}" scale.`;
    }

    if (outputComponents > 1 && type !== "f32" && !allowsScalarToVectorOutput) {
        return `Only f32 vectors are supported for "${name}" right now.`;
    }

    const allowsPackedScalarInput =
        inputComponents === 2 &&
        outputComponents === 1 &&
        type === "u32" &&
        scaleType === "index";
    if (inputComponents > 1 && type !== "f32" && !allowsPackedScalarInput) {
        return `Only f32 vectors are supported for "${name}" input data.`;
    }
    if (
        inputComponents !== outputComponents &&
        !allowsScalarToVectorOutput &&
        !allowsPackedScalarInput
    ) {
        return `Channel "${name}" only supports mismatched input/output components when mapping scalars to vectors.`;
    }

    if (scaleType === "threshold") {
        const domain = channel.scale?.domain;
        const range = channel.scale?.range;
        if (!Array.isArray(domain) || domain.length === 0) {
            return `Threshold scale on "${name}" requires a non-empty domain.`;
        }
        if (!Array.isArray(range) || range.length < 2) {
            return `Threshold scale on "${name}" requires at least two range entries.`;
        }
        if (range.length !== domain.length + 1) {
            return `Threshold scale on "${name}" requires range length of ${
                domain.length + 1
            }, got ${range.length}.`;
        }
        if (inputComponents !== 1) {
            return `Threshold scale on "${name}" requires scalar input values.`;
        }
    }

    if (isPiecewise) {
        const domain = channel.scale?.domain;
        const range = channel.scale?.range;
        if (!Array.isArray(domain) || domain.length < 2) {
            return `Piecewise scale on "${name}" requires at least two domain entries.`;
        }
        if (!Array.isArray(range) || range.length < 2) {
            return `Piecewise scale on "${name}" requires at least two range entries.`;
        }
        if (domain.length !== range.length) {
            return `Piecewise scale on "${name}" requires range length of ${domain.length}, got ${range.length}.`;
        }
        if (inputComponents !== 1) {
            return `Piecewise scale on "${name}" requires scalar input values.`;
        }
    }

    if (scaleType === "ordinal") {
        const range = channel.scale?.range;
        if (!Array.isArray(range) || range.length === 0) {
            return `Ordinal scale on "${name}" requires a non-empty range.`;
        }
        if (
            !Array.isArray(channel.scale?.domain) &&
            !ArrayBuffer.isView(channel.scale?.domain)
        ) {
            return `Ordinal scale on "${name}" requires an explicit domain array.`;
        }
        if (inputComponents !== 1) {
            return `Ordinal scale on "${name}" requires scalar input values.`;
        }
        if (isValueChannelConfig(channel)) {
            if (Array.isArray(channel.value)) {
                return `Ordinal scale on "${name}" requires scalar integer values.`;
            }
            if (
                typeof channel.value === "number" &&
                !Number.isInteger(channel.value)
            ) {
                return `Ordinal scale on "${name}" requires integer values.`;
            }
        }
        if (
            isValueChannelConfig(channel) &&
            outputComponents > 1 &&
            Array.isArray(channel.value)
        ) {
            return `Ordinal scale on "${name}" requires scalar input values for vector outputs.`;
        }
    }

    if (
        scaleType === "band" &&
        !Array.isArray(channel.scale?.domain) &&
        !ArrayBuffer.isView(channel.scale?.domain)
    ) {
        return `Band scale on "${name}" requires an explicit domain array.`;
    }

    if (needsDomainMap) {
        if (scaleType === "band" && inputComponents !== 1) {
            return `Band scale on "${name}" requires scalar inputs when using an ordinal domain.`;
        }
        if (
            scaleType === "band" &&
            isValueChannelConfig(channel) &&
            typeof channel.value === "number" &&
            !Number.isInteger(channel.value)
        ) {
            return `Band scale on "${name}" requires integer values when using an ordinal domain.`;
        }
    }

    return null;
}
