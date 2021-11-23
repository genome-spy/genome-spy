/**
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 */
export default function smoothstep(edge0, edge1, x) {
    x = (x - edge0) / (edge1 - edge0);
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
}
