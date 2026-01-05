import { SCALE_CONSTANT_PREFIX } from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";

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

/** @type {import("../../../index.d.ts").ScaleDef} */
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
    resources: {
        domainRangeKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitSymlogScale,
};
