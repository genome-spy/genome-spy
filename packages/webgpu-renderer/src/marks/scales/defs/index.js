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
import { packHighPrecisionDomain } from "../../../utils/highPrecision.js";

const indexWgsl = /* wgsl */ `
const lowBits: i32 = 12;
const lowDivisor: f32 = pow(2.0, f32(lowBits));
const lowMask: u32 = u32(lowDivisor - 1.0);

fn splitUint(value: u32) -> vec2<f32> {
    let valueLo = value & lowMask;
    let valueHi = value - valueLo;
    return vec2<f32>(f32(valueHi), f32(valueLo));
}

/**
 * High precision variant of scaleBand for the index scale
 */
fn scaleBandHp(value: u32, domainExtent: vec3<f32>, range: vec2<f32>,
        paddingInner: f32, paddingOuter: f32,
        align: f32, band: f32) -> f32 {

    let reverse = range.y < range.x;
    var start = select(range.x, range.y, reverse);
    let stop = select(range.y, range.x, reverse);
    let rangeSpan = stop - start;

    let domainStart = domainExtent.xy;
    let n = domainExtent.z;

    // The following computation is identical for every vertex. Could be done on the JS side.
    let step = rangeSpan / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    let bandwidth = step * (1.0 - paddingInner);

    // Split into to values with each having a reduced number of significant digits
    // to mitigate the lack of precision in float32 calculations.
    let splitValue = splitUint(value);

    // Using max to prevent the shader compiler from wrecking the precision.
    // Otherwise the compiler could optimize the sum of the four terms into
    // some equivalent form that does premature rounding.
    let hi = stableSub(splitValue.x, domainStart.x);
    let lo = stableSub(splitValue.y, domainStart.y);

    if (reverse) {
        let reverseStart = start + (n - 1.0) * step;
        return dot(
            vec4<f32>(reverseStart, -hi, -lo, bandwidth),
            vec4<f32>(1.0, step, step, band)
        );
    } else {
        return dot(
            vec4<f32>(start, hi, lo, bandwidth),
            vec4<f32>(1.0, step, step, band)
        );
    }
}

/**
 * High precision variant of scaleBand for the index scale where 32bit uints
 * are insufficient to address large indices.
 */
fn scaleBandHpU(value: vec2<u32>, domainExtent: vec3<f32>, range: vec2<f32>,
                paddingInner: f32, paddingOuter: f32,
                align: f32, band: f32) -> f32 {

    let reverse = range.y < range.x;
    var start = select(range.x, range.y, reverse);
    let stop = select(range.y, range.x, reverse);
    let rangeSpan = stop - start;

    let domainStart = domainExtent.xy;
    let n = domainExtent.z;

    // The following computation is identical for every vertex. Could be done on the JS side.
    let step = rangeSpan / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    let bandwidth = step * (1.0 - paddingInner);

    // Split into to values with each having a reduced number of significant digits
    // to mitigate the lack of precision in float32 calculations.
    let splitValue = vec2<f32>(f32(value.x) * lowDivisor, f32(value.y));

    // Using max to prevent the shader compiler from wrecking the precision.
    // Otherwise the compiler could optimize the sum of the four terms into
    // some equivalent form that does premature rounding.
    let hi = stableSub(splitValue.x, domainStart.x);
    let lo = stableSub(splitValue.y, domainStart.y);

    if (reverse) {
        let reverseStart = start + (n - 1.0) * step;
        return dot(
            vec4<f32>(reverseStart, -hi, -lo, bandwidth),
            vec4<f32>(1.0, step, step, band)
        );
    } else {
        return dot(
            vec4<f32>(start, hi, lo, bandwidth),
            vec4<f32>(1.0, step, step, band)
        );
    }
}
`;

/**
 * Index scale: band scale optimized for high-precision genomic coordinates.
 *
 * Technical notes: uses split u32 math and stable subtraction to mitigate
 * float32 precision loss, with two WGSL variants for u32 and vec2<u32> inputs.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
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
    vectorOutput: "never",
    allowsU32InputOverride: true,
    wgsl: indexWgsl,
    resources: {
        stopKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    // Domain uses vec3<f32>: split start (xy) + span (z).
    getStopLengths: () => ({ domainLength: 3, rangeLength: 2 }),
    normalizeStops: normalizeIndexStops,
    emit: emitIndexScale,
};

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

/**
 * @param {import("../../../index.d.ts").ScaleStopNormalizeParams} params
 * @returns {import("../../../index.d.ts").ScaleStopNormalizeResult}
 */
function normalizeIndexStops({ name, scale, getDefaultScaleRange }) {
    const domain = Array.isArray(scale.domain) ? scale.domain : [0, 1];
    const range = Array.isArray(scale.range)
        ? scale.range
        : (getDefaultScaleRange(name) ?? [0, 1]);
    if (typeof range[0] !== "number" || typeof range[1] !== "number") {
        throw new Error(`Scale range for "${name}" must be numeric.`);
    }
    const numericRange = /** @type {number[]} */ (range);
    if (domain.length === 3) {
        return {
            domain: [domain[0], domain[1], domain[2]],
            range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
            domainLength: 3,
            rangeLength: 2,
        };
    }
    if (domain.length !== 2) {
        throw new Error(
            `Scale domain for "${name}" must have 2 or 3 entries for "${scale.type}" scales.`
        );
    }
    const packed = packHighPrecisionDomain(domain[0], domain[1]);
    return {
        domain: packed,
        range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
        domainLength: 3,
        rangeLength: 2,
    };
}
