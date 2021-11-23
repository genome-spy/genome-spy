/**
 * Exponential interpolation
 *
 * https://twitter.com/FreyaHolmer/status/1068293398073929728
 *
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns
 */
export default function (a, b, t) {
    return a * Math.pow(b / a, t);
}
