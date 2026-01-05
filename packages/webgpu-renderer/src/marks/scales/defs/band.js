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
import { isValueChannelConfig } from "../../../types.js";
import { normalizeOrdinalDomain } from "../ordinalDomain.js";

const bandWgsl = /* wgsl */ `
// TODO: domainExtent should be uint
fn scaleBand(value: u32, domainExtent: vec2<f32>, range: vec2<f32>,
        paddingInner: f32, paddingOuter: f32,
        align: f32, band: f32) -> f32 {

    // TODO: reverse
    var start = range.x;
    let stop = range.y;
    let rangeSpan = stop - start;

    let n = domainExtent.y - domainExtent.x;

    // This fix departs from Vega and d3: https://github.com/vega/vega/issues/3357#issuecomment-1063253596
    let paddingInnerAdjusted = select(paddingInner, 0.0, i32(n) <= 1);

    // Adapted from: https://github.com/d3/d3-scale/blob/master/src/band.js
    let step = rangeSpan / max(1.0, n - paddingInnerAdjusted + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInnerAdjusted)) * align;
    let bandwidth = step * (1.0 - paddingInnerAdjusted);

    return start + (f32(value) - domainExtent.x) * step + bandwidth * band;
}
`;

/**
 * Band scale: maps discrete indices to evenly spaced bands in a numeric range.
 *
 * Technical notes: implements the d3 band formula in WGSL, including the
 * paddingInner edge case fix, and optionally routes sparse domains through
 * a hash map before band lookup.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
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
    vectorOutput: "never",
    wgsl: bandWgsl,
    resources: {
        stopKind: "continuous",
        needsDomainMap: true,
        needsOrdinalRange: false,
    },
    normalizeStops: normalizeBandStops,
    validate: validateBandScale,
    emit: emitBandScale,
};

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

/**
 * @param {import("../../../index.d.ts").ScaleValidationContext} context
 * @returns {string | null}
 */
function validateBandScale({ name, channel, inputComponents, needsDomainMap }) {
    if (
        !Array.isArray(channel.scale?.domain) &&
        !ArrayBuffer.isView(channel.scale?.domain)
    ) {
        return `Band scale on "${name}" requires an explicit domain array.`;
    }
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
 * @param {import("../../../index.d.ts").ScaleStopNormalizeParams} params
 * @returns {import("../../../index.d.ts").ScaleStopNormalizeResult | undefined}
 */
function normalizeBandStops({ name, scale, getDefaultScaleRange }) {
    const domainSource =
        Array.isArray(scale.domain) || ArrayBuffer.isView(scale.domain)
            ? scale.domain
            : undefined;
    const ordinalDomain = normalizeOrdinalDomain(name, "band", domainSource);
    if (!ordinalDomain) {
        return undefined;
    }
    const range = Array.isArray(scale.range)
        ? scale.range
        : (getDefaultScaleRange(name) ?? [0, 1]);
    if (typeof range[0] !== "number" || typeof range[1] !== "number") {
        throw new Error(`Scale range for "${name}" must be numeric.`);
    }
    const numericRange = /** @type {number[]} */ (range);
    return {
        domain: [0, ordinalDomain.length],
        range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
        domainLength: 2,
        rangeLength: 2,
    };
}
