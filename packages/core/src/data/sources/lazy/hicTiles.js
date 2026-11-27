import { createContigLookup } from "../../../genome/contigNames.js";

/** @typedef {import("@gmod/hic").ContactRecords} ContactRecords */
/** @typedef {import("../../rasterTile.js").RasterDimension} RasterDimension */
/** @typedef {import("../../../types/coordinates.js").CoordinateAssembly["contigs"]} AssemblyContigs */

/** @typedef {{ size: number, origin: number, name: string, index: number }} HicContig */
/** @typedef {{ region: {chr: string, start: number, end: number}, dimension: RasterDimension, index: number }} HicTileAxis */
/** @typedef {{ column: HicTileAxis, row: HicTileAxis, key: string }} HicTileLocation */
/** @typedef {{ binSize: number, dimensions: {column: RasterDimension, row: RasterDimension}, fields: {value: Float32Array} }} HicRasterTile */

const TILE_BINS = 128;
const MAX_TILES = 4096;
const MAX_CELLS = 4 * 1024 ** 2;

/**
 * @param {AssemblyContigs} assembly
 * @param {{name: string, size: number, index: number}[]} fileContigs
 * @returns {HicContig[]}
 */
export function matchHicContigs(assembly, fileContigs) {
    let origin = 0;
    const lookup = createContigLookup(
        assembly.map(({ name, size }) => {
            const contig = { name, size, origin };
            origin += size;
            return contig;
        })
    );
    /** @type {Map<number, HicContig>} */
    const matched = new Map();
    for (const { name, size, index } of fileContigs) {
        if (name.toLowerCase() === "all") continue;
        const contig = lookup.get(name);
        if (!contig) continue;
        if (size !== contig.size || matched.has(contig.origin)) {
            throw new Error(
                `.hic chromosome "${name}" differs from the locus scale assembly.`
            );
        }
        matched.set(contig.origin, {
            name,
            size,
            index,
            origin: contig.origin,
        });
    }
    if (!matched.size) {
        throw new Error("No .hic chromosomes match the locus scale assembly.");
    }
    return Array.from(matched.values()).sort((a, b) => a.origin - b.origin);
}

/**
 * @param {HicContig} contig
 * @param {number} start
 * @param {number} end
 * @param {number} step
 * @returns {HicTileAxis}
 */
function makeAxis(contig, start, end, step) {
    return {
        index: contig.index,
        region: { chr: contig.name, start, end },
        dimension: {
            origin: contig.origin + start,
            step,
            count: (end - start) / step,
        },
    };
}

/**
 * @param {HicContig[]} contigs
 * @param {number} binSize
 * @param {number} lo
 * @param {number} hi
 * @returns {HicTileAxis[] | undefined}
 */
function axisTiles(contigs, binSize, lo, hi) {
    const width = TILE_BINS * binSize;
    const tiles = [];
    for (const contig of contigs) {
        const { size, origin } = contig;
        const start = Math.max(0, lo - origin);
        const end = Math.min(size, hi - origin);
        if (start >= end) continue;

        const completeEnd = size - (size % binSize);
        const alignedStart = Math.floor(start / width) * width;
        for (
            let pos = alignedStart;
            pos < Math.min(end, completeEnd);
            pos += width
        ) {
            tiles.push(
                makeAxis(
                    contig,
                    pos,
                    Math.min(completeEnd, pos + width),
                    binSize
                )
            );
            if (tiles.length > MAX_TILES) return;
        }
        if (end > completeEnd) {
            // The chromosome's final bin can be shorter than the nominal resolution.
            tiles.push(makeAxis(contig, completeEnd, size, size - completeEnd));
            if (tiles.length > MAX_TILES) return;
        }
    }
    return tiles;
}

/**
 * @param {HicContig[]} contigs
 * @param {number} binSize
 * @param {number[]} x X-axis domain in continuous genomic coordinates.
 * @param {number[]} [y] Y-axis domain for a rectangular matrix.
 * @param {number} [depth] Visible half-separation in bases for a triangle.
 */
function planTiles(contigs, binSize, x, y, depth) {
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    const [yMin, yMax] = y
        ? [Math.min(...y), Math.max(...y)]
        : [xMin, xMax + depth];
    const columns = axisTiles(contigs, binSize, xMin - (depth ?? 0), xMax);
    const rows = axisTiles(contigs, binSize, yMin, yMax);
    if (!columns || !rows) return;

    /** @type {HicTileLocation[]} */
    const tiles = [];
    let cells = 0;
    for (const row of rows) {
        const y0 = row.dimension.origin;
        const y1 = y0 + row.dimension.step * row.dimension.count;
        for (const column of columns) {
            const x0 = column.dimension.origin;
            const x1 = x0 + column.dimension.step * column.dimension.count;
            if (
                depth !== undefined &&
                (y1 <= x0 ||
                    y0 - x1 >= 2 * depth ||
                    x1 + y1 <= 2 * xMin ||
                    x0 + y0 >= 2 * xMax)
            ) {
                continue;
            }
            cells += column.dimension.count * row.dimension.count;
            if (cells > MAX_CELLS || tiles.length === MAX_TILES) return;
            tiles.push({ column, row, key: `${binSize}/${x0}/${y0}` });
        }
    }
    return { binSize, tiles, key: tiles.map(({ key }) => key).join(",") };
}

/**
 * @param {HicContig[]} contigs
 * @param {number[]} resolutions Sorted from finest to coarsest.
 * @param {{width: number, height: number}} plot
 * @param {number[]} x
 * @param {number[]} [y] Omit for a triangle track.
 */
export function planHicWindow(contigs, resolutions, plot, x, y) {
    const xSpan = Math.abs(x[1] - x[0]);
    const xRatio = xSpan / Math.min(plot.width, 1024);
    const ratio = y
        ? Math.max(xRatio, Math.abs(y[1] - y[0]) / Math.min(plot.height, 1024))
        : xRatio;
    const depth = y ? undefined : (xSpan * plot.height) / plot.width;
    const target = resolutions.findIndex((binSize) => binSize >= ratio);
    for (
        let i = target < 0 ? resolutions.length - 1 : target;
        i < resolutions.length;
        i++
    ) {
        const window = planTiles(contigs, resolutions[i], x, y, depth);
        if (window) return window;
    }
}

/**
 * @param {HicTileLocation} tile
 * @param {number} binSize
 * @param {ContactRecords} records
 * @param {Float64Array[]} [weights] Weights for the column and row bins.
 * @returns {HicRasterTile}
 */
export function packHicTile({ column, row }, binSize, records, weights) {
    const columns = column.dimension.count;
    const rows = row.dimension.count;
    const columnBin = column.region.start / binSize;
    const rowBin = row.region.start / binSize;
    const values = new Float32Array(columns * rows);
    if (weights) {
        const [x, y] = weights;
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < columns; i++) {
                if (!(x[i] > 0 && y[j] > 0)) values[j * columns + i] = NaN;
            }
        }
    }

    for (let i = 0; i < records.counts.length; i++) {
        const x = records.bin1[i] - columnBin;
        const y = records.bin2[i] - rowBin;
        // A terminal bin may have a shorter displayed extent than its file bin.
        if (x >= 0 && x < columns && y >= 0 && y < rows) {
            const cell = y * columns + x;
            if (!Number.isNaN(values[cell])) values[cell] = records.counts[i];
        }
    }
    return {
        binSize,
        dimensions: { column: column.dimension, row: row.dimension },
        fields: { value: values },
    };
}
