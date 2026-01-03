/**
 * Scale code generation bridges Vega-Lite style configs to WGSL helpers. We
 * intentionally mirror d3 scale semantics (domains, ranges, clamp, etc.) but
 * expose them through the renderer's low-level channel config API.
 *
 * The generator works in a few stages:
 * 1) Validate channel + scale compatibility and derive expected input/output types.
 * 2) Emit WGSL helpers for each scale (including piecewise and threshold cases).
 * 3) Stitch per-channel `getScaled_*` accessors that hide whether values come
 *    from buffers, uniforms, or ramp textures.
 * 4) Keep uniforms, buffers, and textures aligned with the shader's bind layout
 *    so the renderer can update data without regenerating WGSL unnecessarily.
 */

import {
    getScaleDef,
    getScaleInputRule,
    getScaleOutputType,
    isContinuousScale,
    isScaleSupported,
} from "./scaleDefs.js";

/**
 * @typedef {object} ScaleFunctionParams
 * @prop {string} name
 *   Channel name used for function naming and uniform lookups.
 * @prop {"identity"|"linear"|"log"|"pow"|"sqrt"|"symlog"|"band"|"index"|"threshold"|"ordinal"} scale
 *   Scale type that selects which WGSL helper is emitted.
 * @prop {string} rawValueExpr
 *   WGSL expression for the raw value (buffer read or literal/uniform).
 * @prop {"f32"|"u32"|"i32"} inputScalarType
 *   Scalar type of the raw value; used to choose casting behavior.
 * @prop {1|2|4} inputComponents
 *   Vector width of the raw input value.
 * @prop {1|2|4} outputComponents
 *   Output vector width expected by the mark shader.
 * @prop {"f32"|"u32"|"i32"} outputScalarType
 *   Scalar type of the scaled output when outputComponents is 1.
 * @prop {import("../../index.d.ts").ChannelScale | undefined} scaleConfig
 *   Full scale config for detecting piecewise scales and clamp behavior.
 * @prop {string | null} [domainMapName]
 *   Storage buffer identifier for ordinal/band domain lookup (or null if unused).
 * @prop {boolean} [useRangeTexture]
 *   Whether to map scale output through a color ramp texture.
 */
/** @typedef {import("../../index.d.ts").ScaleEmitParams} ScaleEmitParams */

/**
 * @param {import("../../types.js").ScalarType} type
 * @param {1|2|4} components
 * @param {number|number[]} value
 * @returns {string}
 */
export function formatLiteral(type, components, value) {
    const scalarType = type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";

    /**
     * @param {number} v
     * @returns {string}
     */
    const formatScalar = (v) => {
        const num = Number(v ?? 0);
        if (type === "u32") {
            return `u32(${Math.trunc(num)})`;
        }
        if (type === "i32") {
            return `i32(${Math.trunc(num)})`;
        }
        if (Number.isInteger(num)) {
            return `${num}.0`;
        }
        return `${num}`;
    };
    if (components === 1) {
        return formatScalar(Array.isArray(value) ? value[0] : value);
    }
    const values = Array.isArray(value) ? value : [value];
    const padded = values.slice(0, components);
    while (padded.length < components) {
        padded.push(0);
    }
    return `vec${components}<${scalarType}>(${padded
        .map(formatScalar)
        .join(", ")})`;
}

/**
 * @param {ScaleFunctionParams} params
 * @returns {string}
 */
export function buildScaledFunction({
    name,
    scale,
    rawValueExpr,
    inputScalarType: scalarType,
    inputComponents,
    outputComponents,
    outputScalarType,
    scaleConfig,
    domainMapName = null,
    useRangeTexture = false,
}) {
    const domainLength = Array.isArray(scaleConfig?.domain)
        ? scaleConfig.domain.length
        : 0;
    const rangeLength = Array.isArray(scaleConfig?.range)
        ? scaleConfig.range.length
        : 0;
    const isPiecewise = isPiecewiseScale(scaleConfig);

    if (useRangeTexture && outputComponents !== 4) {
        throw new Error(
            `Channel "${name}" requires vec4 output when using interpolate textures.`
        );
    }

    const roundOutput =
        scaleConfig?.round === true &&
        outputComponents === 1 &&
        !useRangeTexture;

    const def = getScaleDef(scale);
    return def.emit({
        name,
        scaleConfig,
        rawValueExpr,
        inputScalarType: scalarType,
        inputComponents,
        outputComponents,
        outputScalarType,
        clamp: scaleConfig?.clamp === true,
        round: roundOutput,
        domainLength,
        rangeLength,
        isPiecewise,
        domainMapName,
        useRangeTexture,
    });
}

/**
 * @param {import("../../index.d.ts").ChannelScale | undefined} scale
 * @returns {boolean}
 */
export function isPiecewiseScale(scale) {
    if (!scale || scale.type !== "linear") {
        return false;
    }
    const domainLength = Array.isArray(scale.domain) ? scale.domain.length : 0;
    const rangeLength = Array.isArray(scale.range) ? scale.range.length : 0;
    return domainLength > 2 || rangeLength > 2;
}

/**
 * @param {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn|undefined} range
 * @returns {boolean}
 */
function isColorRange(range) {
    if (!Array.isArray(range) || range.length === 0) {
        return false;
    }
    return range.every(
        (value) =>
            typeof value === "string" ||
            (Array.isArray(value) && (value.length === 3 || value.length === 4))
    );
}

/**
 * @param {string} name
 * @param {{ scale?: import("../../index.d.ts").ChannelScale, type?: string, components?: number }} channel
 * @returns {string | null}
 */
export function validateScaleConfig(name, channel) {
    const scaleType = channel.scale?.type ?? "identity";
    if (scaleType !== "identity" && !isScaleSupported(scaleType)) {
        return `Channel "${name}" uses unsupported scale "${scaleType}".`;
    }

    const components = channel.components ?? 1;
    const piecewise = isPiecewiseScale(channel.scale);
    const rangeFn = typeof channel.scale?.range === "function";
    const colorRange = isColorRange(channel.scale?.range);
    const interpolateEnabled =
        rangeFn || channel.scale?.interpolate !== undefined || colorRange;
    const isContinuous = isContinuousScale(scaleType);
    const allowsVectorOutput =
        ["identity", "threshold", "ordinal", "linear"].includes(scaleType) ||
        piecewise ||
        (interpolateEnabled && isContinuous);
    if (components > 1 && !allowsVectorOutput) {
        return `Channel "${name}" uses vector components but scale "${scaleType}" only supports scalars.`;
    }
    if (rangeFn && !isContinuous) {
        return `Channel "${name}" only supports function ranges with continuous scales.`;
    }
    if (rangeFn && components !== 4) {
        return `Channel "${name}" requires vec4 outputs when using function ranges.`;
    }
    if (channel.scale?.interpolate !== undefined) {
        if (!colorRange) {
            return `Channel "${name}" requires a color range when interpolate is set.`;
        }
        if (!isContinuous) {
            return `Channel "${name}" only supports color interpolation with continuous scales.`;
        }
        if (components !== 4) {
            return `Channel "${name}" requires vec4 outputs when interpolate is set.`;
        }
    }
    if (isContinuous && colorRange && components !== 4) {
        return `Channel "${name}" requires vec4 outputs when using color ranges.`;
    }
    if (
        (scaleType === "linear" || piecewise) &&
        components !== 1 &&
        components !== 4
    ) {
        return `Channel "${name}" uses ${components} components but linear scales only support scalars or vec4 outputs.`;
    }
    if (scaleType === "threshold" && components !== 1 && components !== 4) {
        return `Channel "${name}" uses ${components} components but threshold scales only support scalars or vec4 outputs.`;
    }
    if (scaleType === "ordinal" && components !== 1 && components !== 4) {
        return `Channel "${name}" uses ${components} components but ordinal scales only support scalars or vec4 outputs.`;
    }
    if (piecewise && components !== 1 && components !== 4) {
        return `Channel "${name}" uses ${components} components but piecewise scales only support scalars or vec4 outputs.`;
    }

    const inputRule = getScaleInputRule(scaleType);
    if (inputRule === "any") {
        return null;
    }

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

    return null;
}

/**
 * @param {string} scaleType
 * @param {"f32"|"u32"|"i32"} scalarType
 * @returns {"f32"|"u32"|"i32"}
 */
export { getScaleOutputType };
