import {
    DOMAIN_MAP_COUNT_PREFIX,
    RANGE_COUNT_PREFIX,
} from "../../../wgsl/prefixes.js";
import { makeFnHeader, toU32Expr } from "../scaleEmitUtils.js";

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitOrdinalScale({
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

    const mapCountName = DOMAIN_MAP_COUNT_PREFIX + name;
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

/** @type {import("../../../index.d.ts").ScaleDef} */
export const ordinalScaleDef = {
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
};
