import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_PREFIX,
    RANGE_COUNT_PREFIX,
    RANGE_PREFIX,
    SCALED_FUNCTION_PREFIX,
    SCALE_ALIGN_PREFIX,
    SCALE_BASE_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_CONSTANT_PREFIX,
    SCALE_EXPONENT_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../../wgsl/prefixes.js";
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
 * @typedef {import("../../index.d.ts").ScaleEmitParams} ScaleEmitParams
 * @typedef {import("./scalePipeline.js").ScalePipelineStep} ScalePipelineStep
 *
 * @typedef {Pick<ScaleEmitParams, "name"|"rawValueExpr"|"inputScalarType"|"clamp"|"round"|"useRangeTexture">} ContinuousEmitParams
 */

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
function domainVec3(name) {
    return `readPacked3(params.${DOMAIN_PREFIX}${name})`;
}

/**
 * @param {string} name
 * @returns {string}
 */
function rangeVec2(name) {
    return `readPacked2(params.${RANGE_PREFIX}${name})`;
}

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
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitIdentity({
    name,
    rawValueExpr,
    outputComponents,
    outputScalarType,
}) {
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    return `${makeFnHeader(name, returnType)} { return ${rawValueExpr}; }`;
}

/**
 * @param {ContinuousEmitParams} params
 * @param {(params: { name: string, valueExpr: string }) => string} valueExprFn
 * @returns {string}
 */
function emitContinuousScale(
    { name, rawValueExpr, inputScalarType, clamp, round, useRangeTexture },
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
        rawValueExpr,
        steps,
        returnType: useRangeTexture ? "vec4<f32>" : "f32",
        useRangeTexture,
    });
}

/**
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitLinearScale(params) {
    const {
        name,
        rawValueExpr,
        inputScalarType,
        outputComponents,
        outputScalarType,
        clamp,
        round,
        useRangeTexture,
        domainLength,
        rangeLength,
    } = params;
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
        return emitContinuousScale(
            {
                name,
                rawValueExpr,
                inputScalarType,
                clamp,
                round,
                useRangeTexture,
            },
            ({ name: scaleName, valueExpr }) =>
                `scaleLinear(${valueExpr}, ${domainVec2(
                    scaleName
                )}, ${rangeVec2(scaleName)})`
        );
    }

    const returnType = useRangeTexture
        ? "vec4<f32>"
        : outputComponents === 1
          ? outputScalarType
          : `vec${outputComponents}<f32>`;
    /** @type {ScalePipelineStep[]} */
    const steps = [];
    if (inputScalarType !== "f32") {
        steps.push(castToF32Step(inputScalarType));
    }
    if (clamp) {
        const domainExpr = `vec2<f32>(params.${DOMAIN_PREFIX}${name}[0].x, params.${DOMAIN_PREFIX}${name}[${resolvedDomainLength}u - 1u].x)`;
        steps.push(clampToDomainStep(domainExpr));
    }
    steps.push(
        piecewiseLinearStep({
            name,
            domainLength: resolvedDomainLength,
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

/**
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitLogScale(params) {
    return emitContinuousScale(params, ({ name, valueExpr }) => {
        return `scaleLog(${valueExpr}, ${domainVec2(
            name
        )}, ${rangeVec2(name)}, params.${SCALE_BASE_PREFIX}${name})`;
    });
}

/**
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitPowScale(params) {
    return emitContinuousScale(params, ({ name, valueExpr }) => {
        return `scalePow(${valueExpr}, ${domainVec2(
            name
        )}, ${rangeVec2(name)}, params.${SCALE_EXPONENT_PREFIX}${name})`;
    });
}

/**
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitSymlogScale(params) {
    return emitContinuousScale(params, ({ name, valueExpr }) => {
        return `scaleSymlog(${valueExpr}, ${domainVec2(
            name
        )}, ${rangeVec2(name)}, params.${SCALE_CONSTANT_PREFIX}${name})`;
    });
}

/**
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitBandScale({
    name,
    rawValueExpr,
    inputScalarType,
    domainMapName,
}) {
    const valueExpr = toU32Expr(rawValueExpr, inputScalarType);
    const mapCountName = `${DOMAIN_MAP_COUNT_PREFIX}${name}`;
    if (domainMapName) {
        return `${makeFnHeader(name, "f32")} {
    let raw = ${valueExpr};
    let mapCount = u32(params.${mapCountName});
    if (mapCount == 0u) {
        return scaleBand(
            raw,
            ${domainVec2(name)},
            ${rangeVec2(name)},
            params.${SCALE_PADDING_INNER_PREFIX}${name},
            params.${SCALE_PADDING_OUTER_PREFIX}${name},
            params.${SCALE_ALIGN_PREFIX}${name},
            params.${SCALE_BAND_PREFIX}${name}
        );
    }
    let mapped = hashLookup(&${domainMapName}, raw, arrayLength(&${domainMapName}));
    if (mapped == HASH_NOT_FOUND) { return ${rangeVec2(name)}.x; }
    return scaleBand(
        mapped,
        ${domainVec2(name)},
        ${rangeVec2(name)},
        params.${SCALE_PADDING_INNER_PREFIX}${name},
        params.${SCALE_PADDING_OUTER_PREFIX}${name},
        params.${SCALE_ALIGN_PREFIX}${name},
        params.${SCALE_BAND_PREFIX}${name}
    );
}`;
    }
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
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitIndexScale({
    name,
    rawValueExpr,
    inputScalarType,
    inputComponents,
}) {
    const valueExpr =
        inputComponents === 2
            ? rawValueExpr
            : toU32Expr(rawValueExpr, inputScalarType);
    const fnName = inputComponents === 2 ? "scaleBandHpU" : "scaleBandHp";
    return `${makeFnHeader(name, "f32")} {
    let v = ${valueExpr};
    return ${fnName}(
        v,
        ${domainVec3(name)},
        ${rangeVec2(name)},
        params.${SCALE_PADDING_INNER_PREFIX}${name},
        params.${SCALE_PADDING_OUTER_PREFIX}${name},
        params.${SCALE_ALIGN_PREFIX}${name},
        params.${SCALE_BAND_PREFIX}${name}
    );
}`;
}

/**
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitOrdinalScale({
    name,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
    domainMapName,
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

    const mapCountName = `${DOMAIN_MAP_COUNT_PREFIX}${name}`;
    if (domainMapName) {
        return `${makeFnHeader(name, returnType)} {
    let raw = ${valueExpr};
    let mapCount = u32(params.${mapCountName});
    if (mapCount == 0u) {
        let count = u32(params.${RANGE_COUNT_PREFIX}${name});
        if (count == 0u) { return ${zero}; }
        let slot = min(raw, count - 1u);
        return ${rangeName}[slot];
    }
    let idx = hashLookup(&${domainMapName}, raw, arrayLength(&${domainMapName}));
    if (idx == HASH_NOT_FOUND) { return ${zero}; }
    let count = u32(params.${RANGE_COUNT_PREFIX}${name});
    if (count == 0u) { return ${zero}; }
    let slot = min(idx, count - 1u);
    return ${rangeName}[slot];
}`;
    }

    return `${makeFnHeader(name, returnType)} {
    let idx = ${valueExpr};
    let count = u32(params.${RANGE_COUNT_PREFIX}${name});
    if (count == 0u) { return ${zero}; }
    let slot = min(idx, count - 1u);
    return ${rangeName}[slot];
}`;
}

/**
 * @param {ScaleEmitParams} params
 * @returns {string}
 */
export function emitThresholdScale({
    name,
    rawValueExpr,
    inputScalarType,
    outputComponents,
    outputScalarType,
    domainLength,
    rangeLength,
}) {
    if (domainLength < 1 || rangeLength !== domainLength + 1) {
        throw new Error(
            `Threshold scale on "${name}" requires domain length N and range length N+1.`
        );
    }
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    /** @type {ScalePipelineStep[]} */
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
