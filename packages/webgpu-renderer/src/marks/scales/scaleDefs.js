import {
    SCALE_ALIGN_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_BASE_PREFIX,
    SCALE_CONSTANT_PREFIX,
    SCALE_EXPONENT_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../../wgsl/prefixes.js";
import {
    emitBandScale,
    emitIdentity,
    emitIndexScale,
    emitLinearScale,
    emitLogScale,
    emitOrdinalScale,
    emitPowScale,
    emitSymlogScale,
    emitThresholdScale,
} from "./scaleEmitters.js";

/** @typedef {import("../../index.d.ts").ScaleDef} ScaleDef */
/** @typedef {import("../../index.d.ts").ScaleInputRule} ScaleInputRule */
/** @typedef {import("../../index.d.ts").ScaleOutputRule} ScaleOutputRule */
/** @typedef {import("../../index.d.ts").ScaleUniformParam} ScaleUniformParam */
/** @typedef {import("../../index.d.ts").ScaleUniformDef} ScaleUniformDef */
/** @typedef {import("../../index.d.ts").ScaleResourceRules} ScaleResourceRules */
/** @typedef {import("../../index.d.ts").ScaleResourceRequirements} ScaleResourceRequirements */

/** @type {Record<string, ScaleDef>} */
const SCALE_DEFS = {
    identity: {
        input: "any",
        output: "same",
        params: [],
        continuous: false,
        resources: {
            domainRangeKind: null,
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitIdentity,
    },
    linear: {
        input: "numeric",
        output: "f32",
        params: [],
        continuous: true,
        resources: {
            domainRangeKind: "continuous",
            supportsPiecewise: true,
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitLinearScale,
    },
    log: {
        input: "numeric",
        output: "f32",
        params: [{ prefix: SCALE_BASE_PREFIX, defaultValue: 10, prop: "base" }],
        continuous: true,
        resources: {
            domainRangeKind: "continuous",
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitLogScale,
    },
    pow: {
        input: "numeric",
        output: "f32",
        params: [
            {
                prefix: SCALE_EXPONENT_PREFIX,
                defaultValue: 1,
                prop: "exponent",
            },
        ],
        continuous: true,
        resources: {
            domainRangeKind: "continuous",
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitPowScale,
    },
    sqrt: {
        input: "numeric",
        output: "f32",
        params: [
            {
                prefix: SCALE_EXPONENT_PREFIX,
                defaultValue: 0.5,
                prop: "exponent",
            },
        ],
        continuous: true,
        resources: {
            domainRangeKind: "continuous",
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitPowScale,
    },
    symlog: {
        input: "numeric",
        output: "f32",
        params: [
            {
                prefix: SCALE_CONSTANT_PREFIX,
                defaultValue: 1,
                prop: "constant",
            },
        ],
        continuous: true,
        resources: {
            domainRangeKind: "continuous",
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitSymlogScale,
    },
    band: {
        input: "u32",
        output: "f32",
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
        resources: {
            domainRangeKind: "continuous",
            needsDomainMap: true,
            needsOrdinalRange: false,
        },
        emit: emitBandScale,
    },
    index: {
        input: "u32",
        output: "f32",
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
        resources: {
            domainRangeKind: "continuous",
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitIndexScale,
    },
    ordinal: {
        input: "u32",
        output: "same",
        params: [],
        continuous: false,
        resources: {
            domainRangeKind: null,
            needsDomainMap: true,
            needsOrdinalRange: true,
        },
        emit: emitOrdinalScale,
    },
    threshold: {
        input: "numeric",
        output: "same",
        params: [],
        continuous: false,
        resources: {
            domainRangeKind: "threshold",
            needsDomainMap: false,
            needsOrdinalRange: false,
        },
        emit: emitThresholdScale,
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
 * Register a custom scale definition.
 *
 * @param {string} name
 * @param {ScaleDef} def
 * @returns {void}
 */
export function registerScaleDef(name, def) {
    SCALE_DEFS[name] = def;
}

/**
 * @param {string} scaleType
 * @param {boolean} isPiecewise
 * @returns {ScaleResourceRequirements}
 */
export function getScaleResourceRequirements(scaleType, isPiecewise) {
    const def = getScaleDef(scaleType);
    const rules = def.resources;
    const domainRangeKind =
        rules.domainRangeKind && rules.supportsPiecewise && isPiecewise
            ? "piecewise"
            : rules.domainRangeKind;
    return {
        domainRangeKind,
        needsDomainMap: Boolean(rules.needsDomainMap),
        needsOrdinalRange: Boolean(rules.needsOrdinalRange),
    };
}

/**
 * @param {string} scaleType
 * @returns {ScaleUniformDef}
 */
export function getScaleUniformDef(scaleType) {
    const def = getScaleDef(scaleType);
    return {
        domainRange: def.resources.domainRangeKind !== null,
        params: def.params,
    };
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
