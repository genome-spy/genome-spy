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
 */
export function getTileWindow(metadata, domains, lengths) {
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
    const ranges = domains.map(([a, b], i) => {
        const lo = Math.max(Math.min(a, b), metadata.min_pos[i]);
        const hi = Math.min(Math.max(a, b), metadata.max_pos[i]);
        return hi > lo
            ? [Math.floor(lo / width), Math.ceil(hi / width)]
            : [0, 0];
    });
    return { level, width, ranges, key: [level, ...ranges.flat()].join(".") };
}

/**
 * @param {{ dense: string, dtype: string }} payload
 * @param {number} bins
 */
export function decodeTile({ dense, dtype }, bins) {
    if (dtype !== "float16" && dtype !== "float32") {
        throw new Error("Unsupported HiGlass tile dtype: " + dtype);
    }
    const bytes = Uint8Array.fromBase64(dense);
    const size = dtype === "float16" ? 2 : 4;
    if (bytes.length !== bins * bins * size) {
        throw new Error("Unexpected HiGlass tile size.");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const read = dtype === "float16" ? view.getFloat16 : view.getFloat32;
    const values = new Float32Array(bins * bins);
    for (let i = 0; i < values.length; i++) {
        values[i] = read.call(view, i * size, true);
    }
    return values;
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
