import { getScaleDef } from "./scaleDefs.js";

/**
 * @param {import("../../index.d.ts").ChannelScale | undefined} scale
 * @returns {boolean}
 */
export function isPiecewiseScale(scale) {
    if (!scale) {
        return false;
    }
    const def = getScaleDef(scale.type ?? "identity");
    if (!def.resources.supportsPiecewise) {
        return false;
    }
    const domainLength = Array.isArray(scale.domain) ? scale.domain.length : 0;
    const rangeLength = Array.isArray(scale.range) ? scale.range.length : 0;
    return domainLength > 2 || rangeLength > 2;
}
