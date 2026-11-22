import {
    getTriangleColumnDomain,
    getTriangleViewport,
} from "../../rasterTile.js";

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
    const triangle =
        triangleHeight === undefined
            ? undefined
            : getTriangleViewport(domains[0], lengths[0], triangleHeight);
    const [a, b] = triangle
        ? [triangle.lo, triangle.hi + triangle.depth]
        : domains[1];
    const start = Math.max(Math.min(a, b), metadata.min_pos[1]);
    const end = Math.min(Math.max(a, b), metadata.max_pos[1]);
    const columns = [Math.min(...domains[0]), Math.max(...domains[0])];
    /** @type {[number, number, number][]} */
    const rows = [];
    for (
        let y = Math.floor(start / width);
        start < end && y * width < end;
        y++
    ) {
        const [min, max] = triangle
            ? getTriangleColumnDomain(
                  triangle,
                  Math.max(start, y * width),
                  Math.min(end, (y + 1) * width)
              )
            : columns;
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
