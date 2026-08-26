import {
    DOMAIN_PREFIX,
    RANGE_PREFIX,
    RANGE_SAMPLER_PREFIX,
    RANGE_TEXTURE_PREFIX,
    SCALED_FUNCTION_PREFIX,
} from "../../wgsl/prefixes.js";

/**
 * @typedef {object} ScalePipelineState
 * @prop {string} expr
 * @prop {string} body
 */

/**
 * @typedef {(state: ScalePipelineState) => ScalePipelineState} ScalePipelineStep
 */

/**
 * @typedef {object} ScalePipeline
 * @prop {string} name
 * @prop {string} [functionName]
 * @prop {string} rawValueExpr
 * @prop {ScalePipelineStep[]} steps
 * @prop {string} returnType
 * @prop {boolean} [useRangeTexture]
 */

/*
 * Pipeline-based WGSL emitter: steps mutate the current expression and can
 * append WGSL blocks. Keeping the blocks as tagged templates preserves WGSL
 * syntax highlighting and makes the steps easy to extend later.
 */

/**
 * @param {string} rawValueExpr
 * @param {"f32"|"u32"|"i32"} inputScalarType
 * @returns {string}
 */
function toFloatExpr(rawValueExpr, inputScalarType) {
    return inputScalarType === "f32" ? rawValueExpr : `f32(${rawValueExpr})`;
}

/**
 * @param {string} block
 * @returns {string}
 */
function normalizeWgslBlock(block) {
    return block.replace(/^\n/, "").replace(/\n\s*$/, "");
}

/**
 * @param {ScalePipelineState} state
 * @param {string} block
 * @returns {ScalePipelineState}
 */
function appendWgslBlock(state, block) {
    const normalized = normalizeWgslBlock(block);
    const body = state.body ? `${state.body}\n${normalized}` : normalized;
    return { ...state, body };
}

/**
 * @param {string} name
 * @param {string} unitExpr
 * @returns {string}
 */
function emitRampSampleBlock(name, unitExpr) {
    const textureName = `${RANGE_TEXTURE_PREFIX}${name}`;
    const samplerName = `${RANGE_SAMPLER_PREFIX}${name}`;
    return /* wgsl */ `
    let unitValue = clamp(${unitExpr}, 0.0, 1.0);
    let rgb = getInterpolatedColor(${textureName}, ${samplerName}, unitValue);
    return vec4<f32>(rgb, 1.0);
`;
}

/**
 * @param {ScalePipeline} pipeline
 * @returns {string}
 */
export function emitScalePipeline(pipeline) {
    /** @type {ScalePipelineState} */
    let state = { expr: pipeline.rawValueExpr, body: "" };

    for (const step of pipeline.steps) {
        state = step(state);
    }

    const body = state.body ? normalizeWgslBlock(state.body) : "";
    const fnName = pipeline.functionName ?? pipeline.name;
    const returnBlock = pipeline.useRangeTexture
        ? emitRampSampleBlock(pipeline.name, state.expr)
        : /* wgsl */ `
    return ${state.expr};
`;
    const returnBody = normalizeWgslBlock(returnBlock);
    const combined = body ? `${body}\n${returnBody}` : returnBody;
    return `fn ${SCALED_FUNCTION_PREFIX}${fnName}(i: u32) -> ${pipeline.returnType} {
${combined}
}`;
}

/**
 * @param {"f32"|"u32"|"i32"} inputScalarType
 * @returns {ScalePipelineStep}
 */
export function castToF32Step(inputScalarType) {
    return (state) => ({
        ...state,
        expr: toFloatExpr(state.expr, inputScalarType),
    });
}

/**
 * @param {string} domainExpr
 * @returns {ScalePipelineStep}
 */
export function clampToDomainStep(domainExpr) {
    return (state) => ({
        ...state,
        expr: `clampToDomain(${state.expr}, ${domainExpr})`,
    });
}

/**
 * @param {string} name
 * @param {(params: { name: string, valueExpr: string }) => string} valueExprFn
 * @returns {ScalePipelineStep}
 */
export function applyScaleStep(name, valueExprFn) {
    return (state) => ({
        ...state,
        expr: valueExprFn({ name, valueExpr: state.expr }),
    });
}

/**
 * @returns {ScalePipelineStep}
 */
export function roundStep() {
    return (state) => ({
        ...state,
        expr: `roundAwayFromZero(${state.expr})`,
    });
}

/*
 * Piecewise/threshold steps need multi-line WGSL control flow, so we emit
 * tagged template blocks and append them to the pipeline body.
 */

/**
 * @param {object} params
 * @param {string} params.name
 * @param {number} params.domainLength
 * @param {1|2|4} params.outputComponents
 * @param {"f32"|"u32"|"i32"} params.outputScalarType
 * @param {boolean} [params.useRangeTexture]
 * @returns {ScalePipelineStep}
 */
export function piecewiseLinearStep({
    name,
    domainLength,
    outputComponents,
    outputScalarType,
    useRangeTexture,
}) {
    const rangeType =
        useRangeTexture || outputComponents === 1
            ? outputScalarType
            : "vec4<f32>";
    /**
     * @param {string} expr
     * @returns {string}
     */
    const rangeAccess = (expr) =>
        useRangeTexture || outputComponents === 1 ? `${expr}.x` : expr;
    return (state) => {
        const block = /* wgsl */ `
    const DOMAIN_LEN: u32 = ${domainLength}u;
    let value = ${state.expr};
    var slot: u32 = 0u;
    for (var i: u32 = 1u; i + 1u < DOMAIN_LEN; i = i + 1u) {
        if (value >= params.${DOMAIN_PREFIX}${name}[i].x) {
            slot = i;
        }
    }
    let d0 = params.${DOMAIN_PREFIX}${name}[slot].x;
    let d1 = params.${DOMAIN_PREFIX}${name}[slot + 1u].x;
    let denom = d1 - d0;
    var t = select(0.0, (value - d0) / denom, denom != 0.0);
    let r0: ${rangeType} = ${rangeAccess(
        `params.${RANGE_PREFIX}${name}[slot]`
    )};
    let r1: ${rangeType} = ${rangeAccess(
        `params.${RANGE_PREFIX}${name}[slot + 1u]`
    )};
    let unit = mix(r0, r1, t);
`;
        return { ...appendWgslBlock(state, block), expr: "unit" };
    };
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {number} params.domainLength
 * @param {1|2|4} params.outputComponents
 * @param {"f32"|"u32"|"i32"} params.outputScalarType
 * @returns {ScalePipelineStep}
 */
export function thresholdStep({
    name,
    domainLength,
    outputComponents,
    outputScalarType,
}) {
    const rangeType = outputComponents === 1 ? outputScalarType : "vec4<f32>";
    const rangeAccess =
        outputComponents === 1
            ? `params.${RANGE_PREFIX}${name}[slot].x`
            : `params.${RANGE_PREFIX}${name}[slot]`;
    return (state) => {
        const block = /* wgsl */ `
    let value = ${state.expr};
    const DOMAIN_LEN: u32 = ${domainLength}u;
    var slot: u32 = 0u;
    for (var i: u32 = 0u; i < DOMAIN_LEN; i = i + 1u) {
        if (value >= params.${DOMAIN_PREFIX}${name}[i].x) {
            slot = i + 1u;
        }
    }
    let out: ${rangeType} = ${rangeAccess};
`;
        return { ...appendWgslBlock(state, block), expr: "out" };
    };
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {number} params.rangeLength
 * @param {1|2|4} params.outputComponents
 * @param {"f32"|"u32"|"i32"} params.outputScalarType
 * @returns {ScalePipelineStep}
 */
export function quantizeStep({
    name,
    rangeLength,
    outputComponents,
    outputScalarType,
}) {
    const rangeType = outputComponents === 1 ? outputScalarType : "vec4<f32>";
    const rangeAccess =
        outputComponents === 1
            ? `params.${RANGE_PREFIX}${name}[slot].x`
            : `params.${RANGE_PREFIX}${name}[slot]`;
    return (state) => {
        const block = /* wgsl */ `
    let value = ${state.expr};
    let d0 = params.${DOMAIN_PREFIX}${name}[0u].x;
    let d1 = params.${DOMAIN_PREFIX}${name}[1u].x;
    let denom = d1 - d0;
    var t = select(0.0, (value - d0) / denom, denom != 0.0);
    t = clamp(t, 0.0, 1.0);
    const RANGE_LEN: u32 = ${rangeLength}u;
    let slot = min(RANGE_LEN - 1u, u32(floor(t * f32(RANGE_LEN))));
    let out: ${rangeType} = ${rangeAccess};
`;
        return { ...appendWgslBlock(state, block), expr: "out" };
    };
}
