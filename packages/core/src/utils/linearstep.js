import clamp from "./clamp.js";

/**
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 */
export default function linearstep(edge0, edge1, x) {
    return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}
