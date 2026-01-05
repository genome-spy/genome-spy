import { makeFnHeader } from "../scaleEmitUtils.js";

/**
 * Identity scale: passes values through without modification.
 *
 * Technical notes: emits a minimal `getScaled_*` helper with no uniforms and
 * allows vector outputs for direct RGBA or vec2/vec4 channels.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const identityScaleDef = {
    input: "any",
    output: "same",
    params: [],
    continuous: false,
    vectorOutput: "always",
    resources: {
        domainRangeKind: null,
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitIdentity,
};

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitIdentity({
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
