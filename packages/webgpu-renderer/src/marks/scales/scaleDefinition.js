import { identityScaleDef } from "./defs/identity.js";

/**
 * Resolve the immutable definition carried by a scale config.
 *
 * Identity is the only implicit scale. All other scales must arrive with an
 * explicitly imported definition from a code-first factory.
 *
 * @param {import("../../index.d.ts").ChannelScale | undefined} scale
 * @returns {import("../../index.d.ts").ScaleDef}
 */
export function getScaleDefinition(scale) {
    if (!scale || scale.type == "identity") {
        return identityScaleDef;
    }
    if (!scale.definition) {
        throw new Error(
            `Scale "${scale.type}" has no definition. Import and use its scale factory.`
        );
    }
    return scale.definition;
}

/**
 * @param {import("../../index.d.ts").ChannelScale | undefined} scale
 * @returns {string}
 */
export function getScaleType(scale) {
    return getScaleDefinition(scale).type;
}

/**
 * @param {import("../../index.d.ts").ScaleDef} definition
 * @param {boolean} isPiecewise
 * @returns {import("../../index.d.ts").ScaleResourceRequirements}
 */
export function getScaleResourceRequirements(definition, isPiecewise) {
    const rules = definition.resources;
    const stopKind =
        rules.stopKind && rules.supportsPiecewise && isPiecewise
            ? "piecewise"
            : rules.stopKind;
    return {
        stopKind,
        needsDomainMap: Boolean(rules.needsDomainMap),
        needsOrdinalRange: Boolean(rules.needsOrdinalRange),
    };
}

/**
 * @param {import("../../index.d.ts").ScaleDef} definition
 * @returns {import("../../index.d.ts").ScaleUniformDef}
 */
export function getScaleUniformDef(definition) {
    return {
        stopArrays: definition.resources.stopKind !== null,
        params: definition.params,
    };
}

/**
 * @param {import("../../index.d.ts").ScaleDef} definition
 * @param {"f32"|"u32"|"i32"} scalarType
 * @returns {"f32"|"u32"|"i32"}
 */
export function getScaleOutputType(definition, scalarType) {
    return definition.output === "same" ? scalarType : "f32";
}
