import { SCALE_CONSTANT_PREFIX } from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";
import { linearScaleDef } from "./linear.js";

const symlogWgsl = /* wgsl */ `
fn log1pPositive(value: f32) -> f32 {
    // Avoid cancellation in log(1 + x) near zero. The first three Taylor terms
    // are more accurate than the rounded sum in this range.
    if (value < 0.01) {
        return value * (1.0 + value * (-0.5 + value / 3.0));
    }
    return log(value + 1.0);
}

fn symlog(value: f32, constant: f32) -> f32 {
    return sign(value) * log1pPositive(abs(value / constant));
}

fn scaleSymlog(value: f32, domain: vec2<f32>, range: vec2<f32>, constant: f32) -> f32 {
    return scaleLinear(
        symlog(value, constant),
        vec2<f32>(symlog(domain.x, constant), symlog(domain.y, constant)),
        range
    );
}
`;

/**
 * Symlog scale: symmetric log mapping around zero with a linear region.
 *
 * Technical notes: emits a `symlog` helper in WGSL and composes it with
 * scaleLinear for domain/range mapping.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const symlogScaleDef = {
    type: "symlog",
    input: "numeric",
    output: "f32",
    params: [
        {
            prefix: SCALE_CONSTANT_PREFIX,
            defaultValue: 1,
            prop: "constant",
        },
    ],
    continuous: true,
    vectorOutput: "interpolated",
    wgslDeps: [linearScaleDef],
    wgsl: symlogWgsl,
    resources: {
        stopKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitSymlogScale,
};
Object.freeze(symlogScaleDef);

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitSymlogScale(params) {
    return emitContinuousScale(params, ({ name, valueExpr }) => {
        return `scaleSymlog(${valueExpr}, ${domainVec2(
            name
        )}, ${rangeVec2(name)}, params.${SCALE_CONSTANT_PREFIX}${name})`;
    });
}
