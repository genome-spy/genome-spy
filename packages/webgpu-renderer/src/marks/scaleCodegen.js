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
    DOMAIN_PREFIX,
    RANGE_PREFIX,
    SCALED_FUNCTION_PREFIX,
    SCALE_ALIGN_PREFIX,
    SCALE_BASE_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_CONSTANT_PREFIX,
    SCALE_EXPONENT_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../wgsl/prefixes.js";
import {
    applyScaleStep,
    castToF32Step,
    clampToDomainStep,
    emitScalePipeline,
    piecewiseLinearStep,
    roundStep,
    thresholdStep,
} from "./scalePipeline.js";

/**
 * @typedef {object} ScaleFunctionParams
 * @prop {string} name
 *   Channel name used for function naming and uniform lookups.
 * @prop {"identity"|"linear"|"log"|"pow"|"sqrt"|"symlog"|"band"|"threshold"|"ordinal"} scale
 *   Scale type that selects which WGSL helper is emitted.
 * @prop {string} rawValueExpr
 *   WGSL expression for the raw value (buffer read or literal/uniform).
 * @prop {"f32"|"u32"|"i32"} inputScalarType
 *   Scalar type of the raw value; used to choose casting behavior.
 * @prop {1|2|4} outputComponents
 *   Output vector width expected by the mark shader.
 * @prop {"f32"|"u32"|"i32"} outputScalarType
 *   Scalar type of the scaled output when outputComponents is 1.
 * @prop {import("../index.d.ts").ChannelScale | undefined} scaleConfig
 *   Full scale config for detecting piecewise scales and clamp behavior.
 * @prop {boolean} [useRangeTexture]
 *   Whether to map scale output through a color ramp texture.
 */

/**
 * @typedef {object} ScaleEmitParams
 * @prop {string} name
 *   Channel name used for function naming and uniform lookups.
 * @prop {string} rawValueExpr
 *   WGSL expression for the raw value (buffer read or literal/uniform).
 * @prop {"f32"|"u32"|"i32"} inputScalarType
 *   Scalar type of the raw value; used to choose casting behavior.
 * @prop {1|2|4} outputComponents
 *   Output vector width expected by the mark shader.
 * @prop {"f32"|"u32"|"i32"} outputScalarType
 *   Scalar type of the scaled output when outputComponents is 1.
 * @prop {boolean} clamp
 *   Whether to clamp input values to the domain extent before scaling.
 * @prop {boolean} round
 *   Whether to round scalar outputs of continuous scales.
 * @prop {number} [domainLength]
 *   Domain length for scales that require fixed-size arrays in WGSL.
 * @prop {boolean} [useRangeTexture]
 *   Whether to sample a color ramp texture instead of returning raw range values.
 */

/**
 * @typedef {(params: ScaleEmitParams) => string} ScaleEmitter
 */

/**
 * @typedef {object} ScaleUniformParam
 * @prop {string} prefix
 * @prop {number} defaultValue
 * @prop {"base"|"exponent"|"constant"|"paddingInner"|"paddingOuter"|"align"|"band"} [prop]
 */

/**
 * @typedef {object} ScaleUniformDef
 * @prop {boolean} domainRange
 * @prop {ScaleUniformParam[]} params
 */

/**
 * @param {import("../types.js").ScalarType} type
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
 * @param {string} name
 * @param {string} returnType
 * @returns {string}
 */
function makeFnHeader(name, returnType) {
    return `fn ${SCALED_FUNCTION_PREFIX}${name}(i: u32) -> ${returnType}`;
}

/**
 * @param {string} name
 * @returns {string}
 */
function domainVec2(name) {
    return `readPacked2(params.${DOMAIN_PREFIX}${name})`;
}

/**
 * @param {string} name
 * @returns {string}
 */
function rangeVec2(name) {
    return `readPacked2(params.${RANGE_PREFIX}${name})`;
}

/**
 * @typedef {object} ContinuousEmitParams
 * @prop {string} name
 * @prop {string} rawValueExpr
 * @prop {"f32"|"u32"|"i32"} inputScalarType
 * @prop {boolean} clamp
 * @prop {boolean} round
 * @prop {boolean} [useRangeTexture]
 *
 * @typedef {object} ContinuousValueExprParams
 * @prop {string} name
 * @prop {string} valueExpr
 */

/**
 * @param {string} rawValueExpr
 * @param {"f32"|"u32"|"i32"} inputScalarType
 * @returns {string}
 */
function toU32Expr(rawValueExpr, inputScalarType) {
    return inputScalarType === "u32"
        ? rawValueExpr
        : `u32(f32(${rawValueExpr}))`;
}

/**
 * @param {ContinuousEmitParams} params
 * @param {(params: ContinuousValueExprParams) => string} valueExprFn
 * @returns {string}
 */
function emitContinuousScale(
    { name, rawValueExpr, inputScalarType, clamp, round, useRangeTexture },
    valueExprFn
) {
    const pipeline = buildContinuousPipeline(
        { name, rawValueExpr, inputScalarType, clamp, round, useRangeTexture },
        valueExprFn
    );
    return emitScalePipeline(pipeline);
}

/**
 * @param {ContinuousEmitParams} params
 * @param {(params: ContinuousValueExprParams) => string} valueExprFn
 * @returns {import("./scalePipeline.js").ScalePipeline}
 */
function buildContinuousPipeline(
    { name, rawValueExpr, inputScalarType, clamp, round, useRangeTexture },
    valueExprFn
) {
    /** @type {import("./scalePipeline.js").ScalePipelineStep[]} */
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

    return {
        name,
        rawValueExpr,
        steps,
        returnType: useRangeTexture ? "vec4<f32>" : "f32",
        useRangeTexture,
    };
}

/** @type {ScaleEmitter} */
function emitBand({ name, rawValueExpr, inputScalarType }) {
    const valueExpr = toU32Expr(rawValueExpr, inputScalarType);
    return `${makeFnHeader(name, "f32")} {
    let v = ${valueExpr};
    return scaleBand(
        v,
        ${domainVec2(name)},
        ${rangeVec2(name)},
        params.${SCALE_PADDING_INNER_PREFIX}${name},
        params.${SCALE_PADDING_OUTER_PREFIX}${name},
        params.${SCALE_ALIGN_PREFIX}${name},
        params.${SCALE_BAND_PREFIX}${name}
    );
}`;
}

/**
 * @param {(params: ContinuousValueExprParams) => string} valueExprFn
 * @returns {ScaleEmitter}
 */
function makeContinuousEmitter(valueExprFn) {
    return (params) => emitContinuousScale(params, valueExprFn);
}

const emitLog = makeContinuousEmitter(
    ({ name, valueExpr }) =>
        `scaleLog(${valueExpr}, ${domainVec2(name)}, ${rangeVec2(name)}, params.${SCALE_BASE_PREFIX}${name})`
);

const emitPow = makeContinuousEmitter(
    ({ name, valueExpr }) =>
        `scalePow(${valueExpr}, ${domainVec2(name)}, ${rangeVec2(name)}, params.${SCALE_EXPONENT_PREFIX}${name})`
);

const emitSymlog = makeContinuousEmitter(
    ({ name, valueExpr }) =>
        `scaleSymlog(${valueExpr}, ${domainVec2(name)}, ${rangeVec2(name)}, params.${SCALE_CONSTANT_PREFIX}${name})`
);

const emitLinear = makeContinuousEmitter(
    ({ name, valueExpr }) =>
        `scaleLinear(${valueExpr}, ${domainVec2(name)}, ${rangeVec2(name)})`
);

/** @type {ScaleEmitter} */
function emitOrdinal({
    name,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
}) {
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    const rangeName = `range_${name}`;
    const zero =
        outputComponents === 1
            ? outputScalarType === "u32"
                ? "0u"
                : outputScalarType === "i32"
                  ? "0"
                  : "0.0"
            : "vec4<f32>(0.0)";
    const valueExpr = toU32Expr(rawValueExpr, inputScalarType);

    return `${makeFnHeader(name, returnType)} {
    let idx = ${valueExpr};
    let count = arrayLength(&${rangeName});
    if (count == 0u) { return ${zero}; }
    let slot = min(idx, count - 1u);
    return ${rangeName}[slot];
}`;
}

/**
 * @param {ScaleEmitParams & { outputComponents: 1|2|4, outputScalarType: "f32"|"u32"|"i32" }} params
 * @returns {string}
 */
function emitThreshold({
    name,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
    domainLength = 0,
}) {
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    /** @type {import("./scalePipeline.js").ScalePipelineStep[]} */
    const steps = [];
    if (inputScalarType !== "f32") {
        steps.push(castToF32Step(inputScalarType));
    }
    steps.push(
        thresholdStep({
            name,
            domainLength,
            outputComponents,
            outputScalarType,
        })
    );
    return emitScalePipeline({
        name,
        rawValueExpr,
        steps,
        returnType,
    });
}

/**
 * @param {ScaleEmitParams & { outputComponents: 1|2|4, outputScalarType: "f32"|"u32"|"i32" }} params
 * @returns {string}
 */
function emitPiecewiseLinear({
    name,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
    clamp,
    round,
    domainLength = 0,
    useRangeTexture,
}) {
    const returnType = useRangeTexture
        ? "vec4<f32>"
        : outputComponents === 1
          ? outputScalarType
          : `vec${outputComponents}<f32>`;
    /** @type {import("./scalePipeline.js").ScalePipelineStep[]} */
    const steps = [];
    if (inputScalarType !== "f32") {
        steps.push(castToF32Step(inputScalarType));
    }
    if (clamp) {
        const domainExpr = `vec2<f32>(params.${DOMAIN_PREFIX}${name}[0].x, params.${DOMAIN_PREFIX}${name}[${domainLength}u - 1u].x)`;
        steps.push(clampToDomainStep(domainExpr));
    }
    steps.push(
        piecewiseLinearStep({
            name,
            domainLength,
            outputComponents,
            outputScalarType,
            useRangeTexture,
        })
    );
    if (round && !useRangeTexture) {
        steps.push(roundStep());
    }
    return emitScalePipeline({
        name,
        rawValueExpr,
        steps,
        returnType,
        useRangeTexture,
    });
}

/** @type {Record<string, { input: "any"|"numeric"|"u32", output: "same"|"f32", domainRange: boolean, params: ScaleUniformParam[], emitter?: ScaleEmitter }>} */
const SCALE_DEFS = {
    identity: {
        input: "any",
        output: "same",
        domainRange: false,
        params: [],
    },
    linear: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [],
    },
    log: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [{ prefix: SCALE_BASE_PREFIX, defaultValue: 10, prop: "base" }],
        emitter: emitLog,
    },
    pow: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [
            {
                prefix: SCALE_EXPONENT_PREFIX,
                defaultValue: 1,
                prop: "exponent",
            },
        ],
        emitter: emitPow,
    },
    sqrt: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [
            {
                prefix: SCALE_EXPONENT_PREFIX,
                defaultValue: 0.5,
                prop: "exponent",
            },
        ],
        emitter: emitPow,
    },
    symlog: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [
            {
                prefix: SCALE_CONSTANT_PREFIX,
                defaultValue: 1,
                prop: "constant",
            },
        ],
        emitter: emitSymlog,
    },
    band: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [
            {
                prefix: SCALE_PADDING_INNER_PREFIX,
                defaultValue: 0,
                prop: "paddingInner",
            },
            {
                prefix: SCALE_PADDING_OUTER_PREFIX,
                defaultValue: 0,
                prop: "paddingOuter",
            },
            { prefix: SCALE_ALIGN_PREFIX, defaultValue: 0.5, prop: "align" },
            { prefix: SCALE_BAND_PREFIX, defaultValue: 0.5, prop: "band" },
        ],
        emitter: emitBand,
    },
    ordinal: {
        input: "u32",
        output: "same",
        domainRange: false,
        params: [],
        emitter: emitOrdinal,
    },
    threshold: {
        input: "numeric",
        output: "same",
        domainRange: false,
        params: [],
        emitter: emitThreshold,
    },
};

export const SCALE_UNIFORM_DEFS = Object.fromEntries(
    Object.entries(SCALE_DEFS).map(([key, value]) => [
        key,
        { domainRange: value.domainRange, params: value.params },
    ])
);

/**
 * @param {string} scaleType
 * @returns {ScaleUniformDef}
 */
export function getScaleUniformDef(scaleType) {
    return SCALE_UNIFORM_DEFS[scaleType] ?? SCALE_UNIFORM_DEFS.identity;
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
    outputComponents,
    outputScalarType,
    scaleConfig,
    useRangeTexture = false,
}) {
    const domainLength = Array.isArray(scaleConfig?.domain)
        ? scaleConfig.domain.length
        : 0;
    const rangeLength = Array.isArray(scaleConfig?.range)
        ? scaleConfig.range.length
        : 0;

    if (useRangeTexture && outputComponents !== 4) {
        throw new Error(
            `Channel "${name}" requires vec4 output when using interpolate textures.`
        );
    }

    const roundOutput =
        scaleConfig?.round === true &&
        outputComponents === 1 &&
        !useRangeTexture;

    if (scale === "linear") {
        const resolvedDomainLength = domainLength || 2;
        const resolvedRangeLength = rangeLength || 2;
        if (resolvedDomainLength < 2 || resolvedRangeLength < 2) {
            throw new Error(
                `Linear scale on "${name}" requires at least two domain and range entries.`
            );
        }
        if (resolvedDomainLength !== resolvedRangeLength) {
            throw new Error(
                `Linear scale on "${name}" requires matching domain/range arrays.`
            );
        }
        if (
            resolvedDomainLength === 2 &&
            resolvedRangeLength === 2 &&
            (useRangeTexture || outputComponents === 1)
        ) {
            return emitLinear({
                name,
                rawValueExpr,
                inputScalarType: scalarType,
                outputComponents,
                outputScalarType,
                clamp: scaleConfig?.clamp === true,
                round: roundOutput,
                useRangeTexture,
            });
        }
        return emitPiecewiseLinear({
            name,
            rawValueExpr,
            inputScalarType: scalarType,
            outputComponents,
            outputScalarType: "f32",
            clamp: scaleConfig?.clamp === true,
            round: roundOutput,
            domainLength: resolvedDomainLength,
            useRangeTexture,
        });
    }

    const def = SCALE_DEFS[scale];
    if (def?.emitter) {
        if (scale === "threshold") {
            if (domainLength < 1 || rangeLength !== domainLength + 1) {
                throw new Error(
                    `Threshold scale on "${name}" requires domain length N and range length N+1.`
                );
            }
        }
        return def.emitter({
            name,
            rawValueExpr,
            inputScalarType: scalarType,
            outputComponents,
            outputScalarType,
            clamp: scaleConfig?.clamp === true,
            round: roundOutput,
            domainLength,
            useRangeTexture,
        });
    }
    const returnType = getScaleOutputType(scale, scalarType);
    return `${makeFnHeader(name, returnType)} { return ${rawValueExpr}; }`;
}

/**
 * @param {import("../index.d.ts").ChannelScale | undefined} scale
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
 * @param {Array<number|number[]|string>|import("../index.d.ts").ColorInterpolatorFn|undefined} range
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
 * @param {{ scale?: import("../index.d.ts").ChannelScale, type?: string, components?: number }} channel
 * @returns {string | null}
 */
export function validateScaleConfig(name, channel) {
    const scaleType = channel.scale?.type ?? "identity";
    if (scaleType !== "identity" && !(scaleType in SCALE_DEFS)) {
        return `Channel "${name}" uses unsupported scale "${scaleType}".`;
    }

    const components = channel.components ?? 1;
    const piecewise = isPiecewiseScale(channel.scale);
    const rangeFn = typeof channel.scale?.range === "function";
    const colorRange = isColorRange(channel.scale?.range);
    const interpolateEnabled =
        rangeFn || channel.scale?.interpolate !== undefined || colorRange;
    const isContinuous = ["linear", "log", "pow", "sqrt", "symlog"].includes(
        scaleType
    );
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

    const inputRule = SCALE_DEFS[scaleType]?.input ?? "any";
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
export function getScaleOutputType(scaleType, scalarType) {
    const output = SCALE_DEFS[scaleType]?.output ?? "same";
    return output === "same" ? scalarType : "f32";
}
