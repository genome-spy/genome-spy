import type {
    ContinuousEmitParams,
    ScalePipeline,
    ScalePipelineStep,
    ScalarType,
} from "../../index.js";

export type {
    ContinuousEmitParams,
    ScalePipeline,
    ScalePipelineStep,
} from "../../index.js";

/** Build the WGSL function header for a channel's getScaled helper. */
export function makeFnHeader(
    name: string,
    returnType: string,
    functionName?: string
): string;

/** Resolve the packed domain uniform to a vec2 expression. */
export function domainVec2(name: string): string;

/** Resolve the packed domain uniform to a vec3 expression. */
export function domainVec3(name: string): string;

/** Resolve the packed range uniform to a vec2 expression. */
export function rangeVec2(name: string): string;

/** Emit an expression that coerces raw values to u32. */
export function toU32Expr(
    rawValueExpr: string,
    inputScalarType: ScalarType
): string;

/** Emit WGSL for a continuous scale helper. */
export function emitContinuousScale(
    params: ContinuousEmitParams,
    valueExprFn: (params: { name: string; valueExpr: string }) => string
): string;

/** Emit WGSL for a scale pipeline built from reusable steps. */
export function emitScalePipeline(pipeline: ScalePipeline): string;

export function castToF32Step(inputScalarType: ScalarType): ScalePipelineStep;
export function clampToDomainStep(domainExpr: string): ScalePipelineStep;
export function applyScaleStep(
    name: string,
    valueExprFn: (params: { name: string; valueExpr: string }) => string
): ScalePipelineStep;
export function roundStep(): ScalePipelineStep;
export function piecewiseLinearStep(params: {
    name: string;
    domainLength: number;
    outputComponents: 1 | 2 | 4;
    outputScalarType: ScalarType;
    useRangeTexture?: boolean;
}): ScalePipelineStep;
export function thresholdStep(params: {
    name: string;
    domainLength: number;
    outputComponents: 1 | 2 | 4;
    outputScalarType: ScalarType;
}): ScalePipelineStep;
