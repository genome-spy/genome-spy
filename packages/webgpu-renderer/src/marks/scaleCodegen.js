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
    RANGE_SAMPLER_PREFIX,
    RANGE_TEXTURE_PREFIX,
    SCALED_FUNCTION_PREFIX,
    SCALE_ALIGN_PREFIX,
    SCALE_BASE_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_CONSTANT_PREFIX,
    SCALE_EXPONENT_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../wgsl/prefixes.js";

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
 * @prop {string} floatExpr
 *   Raw value converted to `f32` so continuous scales can share one math path.
 * @prop {string} u32Expr
 *   Raw value coerced to `u32` for band/indexed lookups that operate on slots.
 * @prop {1|2|4} outputComponents
 *   Output vector width expected by the mark shader.
 * @prop {"f32"|"u32"|"i32"} outputScalarType
 *   Scalar type of the scaled output when outputComponents is 1.
 * @prop {boolean} clamp
 *   Whether to clamp input values to the domain extent before scaling.
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
 * @param {string} name
 * @param {string} unitExpr
 * @returns {string}
 */
function emitRampSample(name, unitExpr) {
    const textureName = `${RANGE_TEXTURE_PREFIX}${name}`;
    const samplerName = `${RANGE_SAMPLER_PREFIX}${name}`;
    return `    let unitValue = clamp(${unitExpr}, 0.0, 1.0);
    let rgb = getInterpolatedColor(${textureName}, ${samplerName}, unitValue);
    return vec4<f32>(rgb, 1.0);`;
}

/** @type {ScaleEmitter} */
function emitBand({ name, u32Expr }) {
    return `${makeFnHeader(name, "f32")} {
    let v = ${u32Expr};
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

/** @type {ScaleEmitter} */
function emitLog({ name, floatExpr, clamp, useRangeTexture }) {
    const clampExpr = clamp
        ? `    v = clampToDomain(v, ${domainVec2(name)});\n`
        : "";
    const valueExpr = `scaleLog(v, ${domainVec2(name)}, ${rangeVec2(name)}, params.${SCALE_BASE_PREFIX}${name})`;
    const returnType = useRangeTexture ? "vec4<f32>" : "f32";
    const returnExpr = useRangeTexture
        ? emitRampSample(name, valueExpr)
        : `    return ${valueExpr};`;
    return `${makeFnHeader(name, returnType)} {
    var v = ${floatExpr};
${clampExpr}${returnExpr}
}`;
}

/** @type {ScaleEmitter} */
function emitPow({ name, floatExpr, clamp, useRangeTexture }) {
    const clampExpr = clamp
        ? `    v = clampToDomain(v, ${domainVec2(name)});\n`
        : "";
    const valueExpr = `scalePow(v, ${domainVec2(name)}, ${rangeVec2(name)}, params.${SCALE_EXPONENT_PREFIX}${name})`;
    const returnType = useRangeTexture ? "vec4<f32>" : "f32";
    const returnExpr = useRangeTexture
        ? emitRampSample(name, valueExpr)
        : `    return ${valueExpr};`;
    return `${makeFnHeader(name, returnType)} {
    var v = ${floatExpr};
${clampExpr}${returnExpr}
}`;
}

/** @type {ScaleEmitter} */
function emitSymlog({ name, floatExpr, clamp, useRangeTexture }) {
    const clampExpr = clamp
        ? `    v = clampToDomain(v, ${domainVec2(name)});\n`
        : "";
    const valueExpr = `scaleSymlog(v, ${domainVec2(name)}, ${rangeVec2(name)}, params.${SCALE_CONSTANT_PREFIX}${name})`;
    const returnType = useRangeTexture ? "vec4<f32>" : "f32";
    const returnExpr = useRangeTexture
        ? emitRampSample(name, valueExpr)
        : `    return ${valueExpr};`;
    return `${makeFnHeader(name, returnType)} {
    var v = ${floatExpr};
${clampExpr}${returnExpr}
}`;
}

/** @type {ScaleEmitter} */
function emitOrdinal({ name, u32Expr, outputComponents, outputScalarType }) {
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

    return `${makeFnHeader(name, returnType)} {
    let idx = ${u32Expr};
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
    floatExpr,
    outputComponents,
    outputScalarType,
    domainLength = 0,
}) {
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    const rangeType = outputComponents === 1 ? outputScalarType : "vec4<f32>";
    const rangeAccess =
        outputComponents === 1
            ? `params.${RANGE_PREFIX}${name}[slot].x`
            : `params.${RANGE_PREFIX}${name}[slot]`;

    return `${makeFnHeader(name, returnType)} {
    let v = ${floatExpr};
    const DOMAIN_LEN: u32 = ${domainLength}u;
    var slot: u32 = 0u;
    for (var i: u32 = 0u; i < DOMAIN_LEN; i = i + 1u) {
        if (v >= params.${DOMAIN_PREFIX}${name}[i].x) {
            slot = i + 1u;
        }
    }
    let out: ${rangeType} = ${rangeAccess};
    return out;
}`;
}

/**
 * @param {ScaleEmitParams & { outputComponents: 1|2|4, outputScalarType: "f32"|"u32"|"i32" }} params
 * @returns {string}
 */
function emitPiecewiseLinear({
    name,
    floatExpr,
    outputComponents,
    outputScalarType,
    clamp,
    domainLength = 0,
    useRangeTexture,
}) {
    const returnType = useRangeTexture
        ? "vec4<f32>"
        : outputComponents === 1
          ? outputScalarType
          : `vec${outputComponents}<f32>`;
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
    const clampInputExpr = clamp
        ? `    v = clampToDomain(v, vec2<f32>(params.${DOMAIN_PREFIX}${name}[0].x, params.${DOMAIN_PREFIX}${name}[DOMAIN_LEN - 1u].x));\n`
        : "";

    return `${makeFnHeader(name, returnType)} {
    const DOMAIN_LEN: u32 = ${domainLength}u;
    var v = ${floatExpr};
${clampInputExpr}
    var slot: u32 = 0u;
    for (var i: u32 = 1u; i + 1u < DOMAIN_LEN; i = i + 1u) {
        if (v >= params.${DOMAIN_PREFIX}${name}[i].x) {
            slot = i;
        }
    }
    let d0 = params.${DOMAIN_PREFIX}${name}[slot].x;
    let d1 = params.${DOMAIN_PREFIX}${name}[slot + 1u].x;
    let denom = d1 - d0;
    var t = select(0.0, (v - d0) / denom, denom != 0.0);
    let r0: ${rangeType} = ${rangeAccess(
        `params.${RANGE_PREFIX}${name}[slot]`
    )};
    let r1: ${rangeType} = ${rangeAccess(
        `params.${RANGE_PREFIX}${name}[slot + 1u]`
    )};
    let unit = mix(r0, r1, t);
${useRangeTexture ? emitRampSample(name, "unit") : "    return unit;"}
}`;
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
    const floatExpr =
        scalarType === "f32" ? rawValueExpr : `f32(${rawValueExpr})`;
    const u32Expr =
        scalarType === "u32" ? rawValueExpr : `u32(f32(${rawValueExpr}))`;

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
        return emitPiecewiseLinear({
            name,
            floatExpr,
            u32Expr,
            outputComponents,
            outputScalarType: "f32",
            clamp: scaleConfig?.clamp === true,
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
            floatExpr,
            u32Expr,
            outputComponents,
            outputScalarType,
            clamp: scaleConfig?.clamp === true,
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
 * @param {Array<number|number[]|string>|undefined} range
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
    const colorRange = isColorRange(channel.scale?.range);
    const interpolateEnabled =
        channel.scale?.interpolate !== undefined || colorRange;
    const allowsVectorOutput =
        ["identity", "threshold", "ordinal", "linear"].includes(scaleType) ||
        piecewise ||
        (interpolateEnabled &&
            ["linear", "log", "pow", "sqrt", "symlog"].includes(scaleType));
    if (components > 1 && !allowsVectorOutput) {
        return `Channel "${name}" uses vector components but scale "${scaleType}" only supports scalars.`;
    }
    if (interpolateEnabled && components !== 4) {
        return `Channel "${name}" requires vec4 outputs when interpolate is set.`;
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
    if (inputRule === "numeric" && !["f32", "u32", "i32"].includes(type)) {
        return `Channel "${name}" requires numeric input for "${scaleType}" scale.`;
    }
    if (inputRule === "u32" && !["u32", "i32"].includes(type)) {
        return `Channel "${name}" requires integer input for "${scaleType}" scale.`;
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
