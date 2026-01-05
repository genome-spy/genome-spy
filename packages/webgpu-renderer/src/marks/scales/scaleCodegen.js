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

import { getScaleDef, getScaleOutputType } from "./scaleDefs.js";
import { isPiecewiseScale } from "./scaleUtils.js";

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

export { validateScaleConfig } from "./scaleValidation.js";

/**
 * @param {string} scaleType
 * @param {"f32"|"u32"|"i32"} scalarType
 * @returns {"f32"|"u32"|"i32"}
 */
export { getScaleOutputType };
