import {
    DOMAIN_MAP_COUNT_PREFIX,
    SCALE_ALIGN_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    makeFnHeader,
    rangeVec2,
    toU32Expr,
} from "../scaleEmitUtils.js";

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitBandScale({ name, rawValueExpr, inputScalarType, domainMapName }) {
    const valueExpr = toU32Expr(rawValueExpr, inputScalarType);
    const mapCountName = DOMAIN_MAP_COUNT_PREFIX + name;
    if (domainMapName) {
        return `${makeFnHeader(name, "f32")} {
    let raw = ${valueExpr};
    let mapCount = u32(params.${mapCountName});
    if (mapCount == 0u) {
        return scaleBand(
            raw,
            ${domainVec2(name)},
            ${rangeVec2(name)},
            params.${SCALE_PADDING_INNER_PREFIX}${name},
            params.${SCALE_PADDING_OUTER_PREFIX}${name},
            params.${SCALE_ALIGN_PREFIX}${name},
            params.${SCALE_BAND_PREFIX}${name}
        );
    }
    let mapped = hashLookup(&${domainMapName}, raw, arrayLength(&${domainMapName}));
    if (mapped == HASH_NOT_FOUND) { return ${rangeVec2(name)}.x; }
    return scaleBand(
        mapped,
        ${domainVec2(name)},
        ${rangeVec2(name)},
        params.${SCALE_PADDING_INNER_PREFIX}${name},
        params.${SCALE_PADDING_OUTER_PREFIX}${name},
        params.${SCALE_ALIGN_PREFIX}${name},
        params.${SCALE_BAND_PREFIX}${name}
    );
}`;
    }
    return `${makeFnHeader(name, "f32")} {
    let v = ${valueExpr};
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

/** @type {import("../../../index.d.ts").ScaleDef} */
export const bandScaleDef = {
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
};
