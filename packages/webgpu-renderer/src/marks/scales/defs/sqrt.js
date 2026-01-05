import { SCALE_EXPONENT_PREFIX } from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";

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

/** @type {import("../../../index.d.ts").ScaleDef} */
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
    resources: {
        domainRangeKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitSqrtScale,
};
