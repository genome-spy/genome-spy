import { makeFnHeader } from "../scaleEmitUtils.js";

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

/** @type {import("../../../index.d.ts").ScaleDef} */
export const identityScaleDef = {
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
};
