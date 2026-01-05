import {
    SCALE_ALIGN_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../../../wgsl/prefixes.js";
import {
    domainVec3,
    makeFnHeader,
    rangeVec2,
    toU32Expr,
} from "../scaleEmitUtils.js";

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitIndexScale({
    name,
    rawValueExpr,
    inputScalarType,
    inputComponents,
}) {
    const valueExpr =
        inputComponents === 2
            ? rawValueExpr
            : toU32Expr(rawValueExpr, inputScalarType);
    const fnName = inputComponents === 2 ? "scaleBandHpU" : "scaleBandHp";
    return `${makeFnHeader(name, "f32")} {
    let v = ${valueExpr};
    return ${fnName}(
        v,
        ${domainVec3(name)},
        ${rangeVec2(name)},
        params.${SCALE_PADDING_INNER_PREFIX}${name},
        params.${SCALE_PADDING_OUTER_PREFIX}${name},
        params.${SCALE_ALIGN_PREFIX}${name},
        params.${SCALE_BAND_PREFIX}${name}
    );
}`;
}

/** @type {import("../../../index.d.ts").ScaleDef} */
export const indexScaleDef = {
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
};
