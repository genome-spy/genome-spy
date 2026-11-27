/**
 * @typedef {object} HiGlassMetadata
 * @prop {number[]} min_pos
 * @prop {number[]} max_pos
 * @prop {number} max_width
 * @prop {number} max_zoom
 * @prop {number} bins_per_dimension
 * @prop {boolean} [mirror_tiles]
 * @prop {[string, number][]} chromsizes
 */

/**
 * @param {HiGlassMetadata} metadata
 * @param {number[][]} domains
 * @param {number[]} lengths
 * @param {number} [triangleHeight] Track height when only x determines the resolution.
 */
export function getTileWindow(metadata, domains, lengths, triangleHeight) {
    const bins = metadata.bins_per_dimension;
    const coarseStep = metadata.max_width / bins;
    // Use the coarser axis to keep the request bounded for asymmetric views.
    const basesPerPixel = Math.max(
        ...domains.map(
            ([a, b], i) => Math.abs(b - a) / Math.min(lengths[i], bins * 8)
        )
    );
    const level = Math.max(
        0,
        Math.min(
            metadata.max_zoom,
            Math.floor(Math.log2(coarseStep / basesPerPixel))
        )
    );
    const width = metadata.max_width / 2 ** level;
    const lo = Math.min(...domains[0]);
    const hi = Math.max(...domains[0]);
    const depth =
        triangleHeight === undefined
            ? undefined
            : ((hi - lo) * triangleHeight) / lengths[0];
    const [a, b] = depth === undefined ? domains[1] : [lo, hi + depth];
    const start = Math.max(Math.min(a, b), metadata.min_pos[1]);
    const end = Math.min(Math.max(a, b), metadata.max_pos[1]);
    /** @type {[number, number, number][]} */
    const rows = [];
    for (
        let y = Math.floor(start / width);
        start < end && y * width < end;
        y++
    ) {
        let min = lo;
        let max = hi;
        if (depth !== undefined) {
            // Bound the columns by the projected midpoint and contact distance.
            const rowStart = Math.max(start, y * width);
            const rowEnd = Math.min(end, (y + 1) * width);
            min = Math.max(2 * lo - rowEnd, rowStart - 2 * depth, lo - depth);
            max = Math.min(2 * hi - rowStart, rowEnd, hi);
        }
        const left = Math.max(min, metadata.min_pos[0]);
        const right = Math.min(max, metadata.max_pos[0]);
        if (left < right)
            rows.push([y, Math.floor(left / width), Math.ceil(right / width)]);
    }
    return { level, width, rows, key: [level, ...rows.flat()].join(".") };
}

/**
 * @param {{ dense: string, dtype: string }} payload
 * @param {number} bins
 */
export function decodeTile({ dense, dtype }, bins) {
    if (dtype !== "float16" && dtype !== "float32") {
        throw new Error("Unsupported HiGlass tile dtype: " + dtype);
    }
    const bytes =
        Uint8Array.fromBase64?.(dense) ??
        Uint8Array.from(atob(dense), (character) => character.charCodeAt(0));
    const size = dtype === "float16" ? 2 : 4;
    if (bytes.length !== bins * bins * size) {
        throw new Error("Unexpected HiGlass tile size.");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const read =
        dtype === "float16"
            ? (view.getFloat16 ?? readFloat16)
            : view.getFloat32;
    const values = new Float32Array(bins * bins);
    for (let i = 0; i < values.length; i++) {
        values[i] = read.call(view, i * size, true);
    }
    return values;
}

/**
 * @this {DataView}
 * @param {number} offset
 * @param {boolean} littleEndian
 */
function readFloat16(offset, littleEndian) {
    const bits = this.getUint16(offset, littleEndian);
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
    if (exponent === 0) return sign * fraction * 2 ** -24;
    return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

/**
 * @param {Float32Array} values
 * @param {number} bins
 */
export function transposeTile(values, bins) {
    const transposed = new Float32Array(values.length);
    for (let y = 0; y < bins; y++) {
        for (let x = 0; x < bins; x++) {
            transposed[x * bins + y] = values[y * bins + x];
        }
    }
    return transposed;
}

/**
 * Fill the unstored half of a symmetric diagonal HiGlass tile.
 * @param {Float32Array} values
 * @param {number} bins
 */
export function mirrorDiagonal(values, bins) {
    for (let y = 1; y < bins; y++) {
        for (let x = 0; x < y; x++) {
            values[x * bins + y] = values[y * bins + x];
        }
    }
}
