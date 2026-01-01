/*
 * WebGPU lacks u64/f64, so we split large indices into hi/lo u32 parts.
 * Series packing uses integer splits; domain packing mirrors the WGSL split
 * logic to preserve precision for large start values and smooth zooming.
 */

/** Number of low bits reserved for the fractional/high-precision split. */
export const LOW_BITS = 12;
/** Base used for hi/lo splitting (2^LOW_BITS). */
export const BASE = 1 << LOW_BITS;
const MAX_U32 = 0xffff_ffff;

/**
 * Pack a non-negative integer into hi/lo parts that match the high-precision
 * band helpers (scaleBandHpU). The split uses base 2^12, so the returned pair
 * is [hi, lo] where value = hi * 2^12 + lo.
 *
 * Internal helper: use the pack* functions below for public series data.
 *
 * @param {number} value
 * @returns {[number, number]} [hi, lo] as unsigned 32-bit integers.
 */
function splitHighPrecision(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(
            "High-precision values must be non-negative safe integers."
        );
    }

    const lo = value % BASE;
    const hi = (value - lo) / BASE;
    if (hi > MAX_U32) {
        throw new Error(
            "High-precision value exceeds the supported range for packed u32."
        );
    }

    return [hi >>> 0, lo >>> 0];
}

/**
 * Split a floating-point domain start into hi/lo parts without fixed-point
 * scaling. This matches the GLSL/WGSL split logic and supports fractional
 * domain starts for smooth panning.
 *
 * @param {number} value
 * @returns {[number, number]}
 */
function splitHighPrecisionFloat(value) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(
            "High-precision domain values must be finite and non-negative."
        );
    }
    const lo = value % BASE;
    const hi = value - lo;
    return [hi, lo];
}

/**
 * Pack a single integer into a 2-component Uint32Array [hi, lo].
 * Use for per-instance series values when the index scale expects packed u32.
 *
 * @param {number} value
 * @returns {Uint32Array}
 */
export function packHighPrecisionU32(value) {
    const [hi, lo] = splitHighPrecision(value);
    return new Uint32Array([hi, lo]);
}

/**
 * Pack multiple integers into a Uint32Array in [hi, lo, hi, lo, ...] order.
 * Use for series buffers when feeding large integer indices to the index scale.
 *
 * @param {ArrayLike<number>} values
 * @returns {Uint32Array}
 */
export function packHighPrecisionU32Array(values) {
    const packed = new Uint32Array(values.length * 2);
    for (let i = 0; i < values.length; i += 1) {
        const [hi, lo] = splitHighPrecision(values[i]);
        const offset = i * 2;
        packed[offset] = hi;
        packed[offset + 1] = lo;
    }
    return packed;
}

/**
 * Pack a high-precision domain into [hi, lo, extent] to match the WGSL split
 * representation. Accepts fractional domain starts for smooth zooming.
 *
 * @param {number} start
 * @param {number} end
 * @returns {[number, number, number]}
 */
export function packHighPrecisionDomain(start, end) {
    const [hi, lo] = splitHighPrecisionFloat(start);
    const extent = Number(end) - Number(start);
    return [hi, lo, extent];
}
