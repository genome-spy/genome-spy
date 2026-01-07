import {
    DOMAIN_PREFIX,
    RANGE_PREFIX,
    SCALED_FUNCTION_PREFIX,
} from "../../wgsl/prefixes.js";
import {
    applyScaleStep,
    castToF32Step,
    clampToDomainStep,
    emitScalePipeline,
    roundStep,
} from "./scalePipeline.js";

/**
 * @typedef {import("../../index.d.ts").ScaleEmitParams} ScaleEmitParams
 * @typedef {import("./scalePipeline.js").ScalePipelineStep} ScalePipelineStep
 * @typedef {Pick<ScaleEmitParams, "name"|"functionName"|"rawValueExpr"|"inputScalarType"|"clamp"|"round"|"useRangeTexture">} ContinuousEmitParams
 */

/**
 * @param {string} name
 * @param {string} returnType
 * @returns {string}
 */
export function makeFnHeader(name, returnType, functionName = name) {
    return `fn ${SCALED_FUNCTION_PREFIX}${functionName}(i: u32) -> ${returnType}`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function domainVec2(name) {
    return `readPacked2(params.${DOMAIN_PREFIX}${name})`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function domainVec3(name) {
    return `readPacked3(params.${DOMAIN_PREFIX}${name})`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function rangeVec2(name) {
    return `readPacked2(params.${RANGE_PREFIX}${name})`;
}

/**
 * @param {string} rawValueExpr
 * @param {"f32"|"u32"|"i32"} inputScalarType
 * @returns {string}
 */
export function toU32Expr(rawValueExpr, inputScalarType) {
    return inputScalarType === "u32"
        ? rawValueExpr
        : `u32(f32(${rawValueExpr}))`;
}

/**
 * @param {ContinuousEmitParams} params
 * @param {(params: { name: string, valueExpr: string }) => string} valueExprFn
 * @returns {string}
 */
export function emitContinuousScale(
    {
        name,
        functionName,
        rawValueExpr,
        inputScalarType,
        clamp,
        round,
        useRangeTexture,
    },
    valueExprFn
) {
    /** @type {ScalePipelineStep[]} */
    const steps = [];

    if (inputScalarType !== "f32") {
        steps.push(castToF32Step(inputScalarType));
    }

    if (clamp) {
        steps.push(clampToDomainStep(domainVec2(name)));
    }

    steps.push(applyScaleStep(name, valueExprFn));

    if (round && !useRangeTexture) {
        steps.push(roundStep());
    }

    return emitScalePipeline({
        name,
        functionName,
        rawValueExpr,
        steps,
        returnType: useRangeTexture ? "vec4<f32>" : "f32",
        useRangeTexture,
    });
}
