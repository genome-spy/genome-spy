import {
    SCALE_ALIGN_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_BASE_PREFIX,
    SCALE_CONSTANT_PREFIX,
    SCALE_EXPONENT_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../../wgsl/prefixes.js";

/**
 * @typedef {"any"|"numeric"|"u32"} ScaleInputRule
 * @typedef {"same"|"f32"} ScaleOutputRule
 *
 * @typedef {object} ScaleUniformParam
 * @prop {string} prefix
 * @prop {number} defaultValue
 * @prop {"base"|"exponent"|"constant"|"paddingInner"|"paddingOuter"|"align"|"band"} [prop]
 *
 * @typedef {object} ScaleUniformDef
 * @prop {boolean} domainRange
 * @prop {ScaleUniformParam[]} params
 *
 * @typedef {object} ScaleDef
 * @prop {ScaleInputRule} input
 * @prop {ScaleOutputRule} output
 * @prop {boolean} domainRange
 *   True when the scale reads domain/range uniforms (as opposed to identity/ordinal).
 * @prop {ScaleUniformParam[]} params
 *   Extra uniforms required by the scale (e.g. base, exponent, padding).
 * @prop {boolean} continuous
 *   Continuous scales map numeric inputs to numeric outputs and support clamping
 *   and interpolated ranges (linear/log/pow/sqrt/symlog).
 */

/** @type {Record<string, ScaleDef>} */
const SCALE_DEFS = {
    identity: {
        input: "any",
        output: "same",
        domainRange: false,
        params: [],
        continuous: false,
    },
    linear: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [],
        continuous: true,
    },
    log: {
        input: "numeric",
        output: "f32",
        domainRange: true,
        params: [{ prefix: SCALE_BASE_PREFIX, defaultValue: 10, prop: "base" }],
        continuous: true,
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
        continuous: true,
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
        continuous: true,
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
        continuous: true,
    },
    band: {
        input: "u32",
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
        continuous: false,
    },
    index: {
        input: "u32",
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
        continuous: false,
    },
    ordinal: {
        input: "u32",
        output: "same",
        domainRange: false,
        params: [],
        continuous: false,
    },
    threshold: {
        input: "numeric",
        output: "same",
        domainRange: false,
        params: [],
        continuous: false,
    },
};

/**
 * @param {string} scaleType
 * @returns {ScaleDef}
 */
export function getScaleDef(scaleType) {
    return SCALE_DEFS[scaleType] ?? SCALE_DEFS.identity;
}

/**
 * @param {string} scaleType
 * @returns {boolean}
 */
export function isScaleSupported(scaleType) {
    return scaleType in SCALE_DEFS;
}

/**
 * @param {string} scaleType
 * @returns {ScaleUniformDef}
 */
export function getScaleUniformDef(scaleType) {
    const def = getScaleDef(scaleType);
    return { domainRange: def.domainRange, params: def.params };
}

/**
 * @param {string} scaleType
 * @returns {ScaleInputRule}
 */
export function getScaleInputRule(scaleType) {
    return getScaleDef(scaleType).input;
}

/**
 * @param {string} scaleType
 * @returns {boolean}
 */
export function isContinuousScale(scaleType) {
    return getScaleDef(scaleType).continuous;
}

/**
 * @param {string} scaleType
 * @param {"f32"|"u32"|"i32"} scalarType
 * @returns {"f32"|"u32"|"i32"}
 */
export function getScaleOutputType(scaleType, scalarType) {
    const output = getScaleDef(scaleType).output;
    return output === "same" ? scalarType : "f32";
}
