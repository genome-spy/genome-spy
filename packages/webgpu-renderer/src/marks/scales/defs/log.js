import { SCALE_BASE_PREFIX } from "../../../wgsl/prefixes.js";
import {
    domainVec2,
    emitContinuousScale,
    rangeVec2,
} from "../scaleEmitUtils.js";

/**
 * @param {import("../../../index.d.ts").ScaleEmitParams} params
 * @returns {string}
 */
function emitLogScale(params) {
    return emitContinuousScale(params, ({ name, valueExpr }) => {
        return `scaleLog(${valueExpr}, ${domainVec2(
            name
        )}, ${rangeVec2(name)}, params.${SCALE_BASE_PREFIX}${name})`;
    });
}

/** @type {import("../../../index.d.ts").ScaleDef} */
export const logScaleDef = {
    input: "numeric",
    output: "f32",
    params: [{ prefix: SCALE_BASE_PREFIX, defaultValue: 10, prop: "base" }],
    continuous: true,
    resources: {
        domainRangeKind: "continuous",
        needsDomainMap: false,
        needsOrdinalRange: false,
    },
    emit: emitLogScale,
};
