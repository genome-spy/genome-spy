/**
 * @param {number} value
 * @param {number} [min]
 * @param {number} [max]
 */
export default function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}
