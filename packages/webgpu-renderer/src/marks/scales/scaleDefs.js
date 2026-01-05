import { bandScaleDef } from "./defs/band.js";
import { identityScaleDef } from "./defs/identity.js";
import { indexScaleDef } from "./defs/index.js";
import { linearScaleDef } from "./defs/linear.js";
import { logScaleDef } from "./defs/log.js";
import { ordinalScaleDef } from "./defs/ordinal.js";
import { powScaleDef } from "./defs/pow.js";
import { sqrtScaleDef } from "./defs/sqrt.js";
import { symlogScaleDef } from "./defs/symlog.js";
import { thresholdScaleDef } from "./defs/threshold.js";

/** @typedef {import("../../index.d.ts").ScaleDef} ScaleDef */
/** @typedef {import("../../index.d.ts").ScaleInputRule} ScaleInputRule */
/** @typedef {import("../../index.d.ts").ScaleOutputRule} ScaleOutputRule */
/** @typedef {import("../../index.d.ts").ScaleUniformParam} ScaleUniformParam */
/** @typedef {import("../../index.d.ts").ScaleUniformDef} ScaleUniformDef */
/** @typedef {import("../../index.d.ts").ScaleResourceRules} ScaleResourceRules */
/** @typedef {import("../../index.d.ts").ScaleResourceRequirements} ScaleResourceRequirements */

/** @type {Record<string, ScaleDef>} */
const SCALE_DEFS = {
    identity: identityScaleDef,
    linear: linearScaleDef,
    log: logScaleDef,
    pow: powScaleDef,
    sqrt: sqrtScaleDef,
    symlog: symlogScaleDef,
    band: bandScaleDef,
    index: indexScaleDef,
    ordinal: ordinalScaleDef,
    threshold: thresholdScaleDef,
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
