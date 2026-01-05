import { SCALE_EXPONENT_PREFIX } from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";

const powWgsl = /* wgsl */ `
fn scalePow(value: f32, domain: vec2<f32>, range: vec2<f32>, exponent: f32) -> f32 {
    // y = mx^k + b
    // TODO: Perf optimization: precalculate pow domain in js.
    // TODO: Reversed domain, etc
    return scaleLinear(
        pow(abs(value), exponent) * sign(value),
        pow(abs(domain), vec2<f32>(exponent)) * sign(domain),
        range
    );
}
`;

/**
 * Pow scale: exponentiated linear mapping with sign preservation.
 *
 * Technical notes: composes the exponent transform with scaleLinear in WGSL,
 * which keeps domain/range handling consistent across continuous scales.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const powScaleDef = {
    input: "numeric",
    output: "f32",
    params: [
        {
            prefix: SCALE_EXPONENT_PREFIX,
            defaultValue: 1,
            prop: "exponent",
        },
    ],
    continuous: true,
    vectorOutput: "interpolated",
    wgslDeps: ["linear"],
    wgsl: powWgsl,
    resources: {
        domainRangeKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitPowScale,
};

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitPowScale(params) {
    return emitContinuousScale(params, ({ name, valueExpr }) => {
        return `scalePow(${valueExpr}, ${domainVec2(
            name
        )}, ${rangeVec2(name)}, params.${SCALE_EXPONENT_PREFIX}${name})`;
    });
}
