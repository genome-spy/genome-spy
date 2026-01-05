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
 * Scale emission params shared with validation and channel analysis.
 * @typedef {import("../../index.d.ts").ScaleFunctionParams} ScaleFunctionParams
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
    scalarType,
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
