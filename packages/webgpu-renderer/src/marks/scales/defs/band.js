import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_MAP_TABLE_PREFIX,
    SCALE_ALIGN_PREFIX,
    SCALE_BAND_PREFIX,
    SCALE_PADDING_INNER_PREFIX,
    SCALE_PADDING_OUTER_PREFIX,
} from "../../../wgsl/prefixes.js";
import { hashLookupFunctionName } from "../../../wgsl/hashTable.wgsl.js";
import {
    domainVec2,
    makeFnHeader,
    rangeVec2,
    toU32Expr,
} from "../scaleEmitUtils.js";
import { isValueChannelConfig } from "../../../types.js";
import { normalizeOrdinalDomain } from "../ordinalDomain.js";

const bandWgsl = /* wgsl */ `
// TODO: domainExtent should be uint
fn scaleBand(value: u32, domainExtent: vec2<f32>, range: vec2<f32>,
        paddingInner: f32, paddingOuter: f32,
        align: f32, band: f32) -> f32 {

    let reverse = range.y < range.x;
    var start = select(range.x, range.y, reverse);
    let stop = select(range.y, range.x, reverse);
    let rangeSpan = stop - start;

    let n = domainExtent.y - domainExtent.x;

    // Match Vega's band space, including singleton domains with padding.
    let space = n - paddingInner + paddingOuter * 2.0;
    let step = rangeSpan / select(1.0, space, space > 0.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    let bandwidth = step * (1.0 - paddingInner);

    var offset = f32(value) - domainExtent.x;
    if (reverse) {
        offset = (n - 1.0) - offset;
    }
    return start + offset * step + bandwidth * band;
}
`;

/**
 * Band scale: maps discrete indices to evenly spaced bands in a numeric range.
 *
 * Technical notes: implements the Vega band formula in WGSL and optionally
 * routes sparse domains through a hash map before band lookup.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const bandScaleDef = {
    type: "band",
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
    vectorOutput: "never",
    allowsU32InputOverride: true,
    wgsl: bandWgsl,
    resources: {
        stopKind: "continuous",
        needsDomainMap: true,
        needsOrdinalRange: false,
    },
    normalizeDomainMap: normalizeBandDomainMap,
    validate: validateBandScale,
    emit: emitBandScale,
};
Object.freeze(bandScaleDef);

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitBandScale({
    name,
    functionName,
    rawValueExpr,
    inputScalarType,
    domainMapName,
}) {
    const valueExpr = toU32Expr(rawValueExpr, inputScalarType);
    const mapCountName = DOMAIN_MAP_COUNT_PREFIX + name;
    if (domainMapName) {
        // WGSL rejects constant NaNs, so construct the missing position at runtime.
        return `${makeFnHeader(name, "f32", functionName)} {
    let raw = ${valueExpr};
    var mapped = raw;
    if (params.${mapCountName} >= 0.0) {
        mapped = ${hashLookupFunctionName(domainMapName)}(raw, params.${DOMAIN_MAP_TABLE_PREFIX}${name}.y);
        if (mapped == HASH_NOT_FOUND) { return bitcast<f32>(raw | 0x7fc00000u); }
    }
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
    return `${makeFnHeader(name, "f32", functionName)} {
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

/**
 * @param {import("../../../index.d.ts").ScaleValidationContext} context
 * @returns {string | null}
 */
function validateBandScale({ name, channel, inputComponents, needsDomainMap }) {
    if (needsDomainMap) {
        if (inputComponents !== 1) {
            return `Band scale on "${name}" requires scalar inputs when using an ordinal domain.`;
        }
        if (
            isValueChannelConfig(channel) &&
            typeof channel.value === "number" &&
            !Number.isInteger(channel.value)
        ) {
            return `Band scale on "${name}" requires integer values when using an ordinal domain.`;
        }
    }
    return null;
}

/**
 * @param {import("../../../index.d.ts").ScaleDomainMapParams} params
 * @returns {import("../../../index.d.ts").ScaleDomainMapUpdate | null}
 */
function normalizeBandDomainMap({ name, domain }) {
    const ordinalDomain = normalizeOrdinalDomain(name, "band", domain);
    if (!ordinalDomain) {
        return null;
    }
    return {
        domainMap: ordinalDomain,
        domainUniform: [0, ordinalDomain.length],
    };
}
