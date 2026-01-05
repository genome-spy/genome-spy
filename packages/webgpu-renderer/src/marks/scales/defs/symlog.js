import { SCALE_CONSTANT_PREFIX } from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";

const symlogWgsl = /* wgsl */ `
fn symlog(value: f32, constant: f32) -> f32 {
    // WARNING: emulating log1p with log(x + 1). Small numbers are likely to
    // have significant precision problems.
    return sign(value) * log(abs(value / constant) + 1.0);
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
    wgslDeps: ["linear"],
    wgsl: symlogWgsl,
    resources: {
        stopKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitSymlogScale,
};

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
