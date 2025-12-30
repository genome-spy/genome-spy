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
    SCALE_THRESHOLD_COUNT_PREFIX,
} from "../wgsl/prefixes.js";

export const THRESHOLD_RANGE_SLOTS = 4;

/**
 * @typedef {object} ScaleFunctionParams
 * @prop {string} name
 *   Channel name used for function naming and uniform lookups.
 * @prop {"identity"|"linear"|"log"|"pow"|"sqrt"|"symlog"|"band"|"threshold"} scale
 *   Scale type that selects which WGSL helper is emitted.
 * @prop {string} rawValueExpr
 *   WGSL expression for the raw value (buffer read or literal/uniform).
 * @prop {"f32"|"u32"|"i32"} scalarType
 *   Scalar type of the raw value; used to choose casting behavior.
 * @prop {1|2|4} outputComponents
 *   Output vector width expected by the mark shader.
 * @prop {"f32"|"u32"|"i32"} outputScalarType
 *   Scalar type of the scaled output when outputComponents is 1.
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

/** @type {ScaleEmitter} */
function emitLinear({ name, floatExpr }) {
    return `${makeFnHeader(name, "f32")} {
  let v = ${floatExpr};
  return scaleLinear(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy);
}`;
}

/** @type {ScaleEmitter} */
function emitBand({ name, u32Expr }) {
    return `${makeFnHeader(name, "f32")} {
  let v = ${u32Expr};
  return scaleBand(
    v,
    params.${DOMAIN_PREFIX}${name}.xy,
    params.${RANGE_PREFIX}${name}.xy,
    params.${SCALE_PADDING_INNER_PREFIX}${name},
    params.${SCALE_PADDING_OUTER_PREFIX}${name},
    params.${SCALE_ALIGN_PREFIX}${name},
    params.${SCALE_BAND_PREFIX}${name}
  );
}`;
}

/** @type {ScaleEmitter} */
function emitLog({ name, floatExpr }) {
    return `${makeFnHeader(name, "f32")} {
  let v = ${floatExpr};
  return scaleLog(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy, params.${SCALE_BASE_PREFIX}${name});
}`;
}

/** @type {ScaleEmitter} */
function emitPow({ name, floatExpr }) {
    return `${makeFnHeader(name, "f32")} {
  let v = ${floatExpr};
  return scalePow(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy, params.${SCALE_EXPONENT_PREFIX}${name});
}`;
}

/** @type {ScaleEmitter} */
function emitSymlog({ name, floatExpr }) {
    return `${makeFnHeader(name, "f32")} {
  let v = ${floatExpr};
  return scaleSymlog(v, params.${DOMAIN_PREFIX}${name}.xy, params.${RANGE_PREFIX}${name}.xy, params.${SCALE_CONSTANT_PREFIX}${name});
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
}) {
    const returnType =
        outputComponents === 1
            ? outputScalarType
            : `vec${outputComponents}<f32>`;
    const thresholds = `params.${DOMAIN_PREFIX}${name}`;
    const count = `params.${SCALE_THRESHOLD_COUNT_PREFIX}${name}`;
    const rangeValues = Array.from(
        { length: THRESHOLD_RANGE_SLOTS },
        (_, index) => `params.${RANGE_PREFIX}${name}_${index}`
    );

    const selector = outputComponents === 1 ? "var out" : "var out";
    const rangeType = outputComponents === 1 ? outputScalarType : "vec4<f32>";

    return `${makeFnHeader(name, returnType)} {
  let v = ${floatExpr};
  let thresholds = ${thresholds};
  let count = u32(${count});
  var slot: u32 = 0u;
  if (count > 0u && v >= thresholds.x) { slot = 1u; }
  if (count > 1u && v >= thresholds.y) { slot = 2u; }
  if (count > 2u && v >= thresholds.z) { slot = 3u; }
  ${selector}: ${rangeType} = ${rangeValues[0]};
  if (slot == 1u) { out = ${rangeValues[1]}; }
  if (slot == 2u) { out = ${rangeValues[2]}; }
  if (slot == 3u) { out = ${rangeValues[3]}; }
  return out;
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
        emitter: emitLinear,
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
    scalarType,
    outputComponents,
    outputScalarType,
}) {
    const floatExpr =
        scalarType === "f32" ? rawValueExpr : `f32(${rawValueExpr})`;
    const u32Expr =
        scalarType === "u32" ? rawValueExpr : `u32(f32(${rawValueExpr}))`;

    const def = SCALE_DEFS[scale];
    if (def?.emitter) {
        return def.emitter({
            name,
            floatExpr,
            u32Expr,
            outputComponents,
            outputScalarType,
        });
    }
    const returnType = getScaleOutputType(scale, scalarType);
    return `${makeFnHeader(name, returnType)} { return ${rawValueExpr}; }`;
}

/**
 * @param {string} name
 * @param {{ scale?: { type?: string }, type?: string, components?: number }} channel
 * @returns {string | null}
 */
export function validateScaleConfig(name, channel) {
    const scaleType = channel.scale?.type ?? "identity";
    if (scaleType !== "identity" && !(scaleType in SCALE_DEFS)) {
        return `Channel "${name}" uses unsupported scale "${scaleType}".`;
    }

    const components = channel.components ?? 1;
    if (components > 1 && !["identity", "threshold"].includes(scaleType)) {
        return `Channel "${name}" uses vector components but scale "${scaleType}" only supports scalars.`;
    }
    if (scaleType === "threshold" && components !== 1 && components !== 4) {
        return `Channel "${name}" uses ${components} components but threshold scales only support scalars or vec4 outputs.`;
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
