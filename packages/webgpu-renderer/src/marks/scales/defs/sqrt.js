import { SCALE_EXPONENT_PREFIX } from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";

/**
 * Sqrt scale: power scale with exponent fixed to 0.5.
 *
 * Technical notes: implemented as a pow scale with a fixed exponent and WGSL
 * dependency on scalePow for shared math.
 *
 * @type {import("../../../index.d.ts").ScaleDef}
 */
export const sqrtScaleDef = {
    input: "numeric",
    output: "f32",
    params: [
        {
            prefix: SCALE_EXPONENT_PREFIX,
            defaultValue: 0.5,
            prop: "exponent",
        },
    ],
    continuous: true,
    vectorOutput: "interpolated",
    wgslDeps: ["pow"],
    resources: {
        domainRangeKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitSqrtScale,
};

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitSqrtScale(params) {
    return emitContinuousScale(params, ({ name, valueExpr }) => {
        return `scalePow(${valueExpr}, ${domainVec2(
            name
        )}, ${rangeVec2(name)}, params.${SCALE_EXPONENT_PREFIX}${name})`;
    });
}
