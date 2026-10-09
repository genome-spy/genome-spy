const fraction = new Float32Array(1);
const fractionBits = new Uint32Array(fraction.buffer);
const base = 2 ** 12;

/**
 * Packs an index as [integerHi, integerLo, float32FractionBits, 0].
 * The integer uses the existing base-4096 split; the fraction stays separate
 * so zooming near large indices does not lose sub-row positions.
 *
 * @param {number} value
 * @param {number[]} [target]
 */
export function packFractionalIndex(value, target = []) {
    if (!Number.isFinite(value) || value < 0 || value >= 2 ** 44) {
        throw new Error(
            "Fractional index positions must be finite and in [0, 2^44)."
        );
    }

    const integer = Math.floor(value);
    const lo = integer % base;
    fraction[0] = value - integer;
    target[0] = (integer - lo) / base;
    target[1] = lo;
    target[2] = fractionBits[0];
    target[3] = 0;
    return target;
}

/**
 * @param {import("../types/encoder.js").VegaScale | undefined} scale
 */
export function isFractionalIndexScale(scale) {
    const indexScale =
        /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (scale);
    return scale?.type === "index" && (indexScale.fractional?.() ?? false);
}
