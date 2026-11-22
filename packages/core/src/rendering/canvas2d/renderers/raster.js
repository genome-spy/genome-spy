import { readNumericRasterCell } from "../../../data/rasterTile.js";
import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import clamp from "../../../utils/clamp.js";
import ViewError from "../../../view/viewError.js";
import { packCssColor } from "../../color.js";
import {
    getRasterTriangle,
    visitRasterTiles,
} from "../../immediate/marks/raster.js";
import { getCanvasOpacitySpans } from "../rasterOpacity.js";

/**
 * A collector publication replaces its tile payloads. Mapping updates can
 * mutate the Vega scale in place, so use the completed mapping snapshot.
 * @type {WeakMap<import("../../../marks/raster.js").default, {
 *     signature: unknown[],
 *     getTile: (datum: object) => ReturnType<typeof paintTile>
 * }>}
 */
const tileCaches = new WeakMap();

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {ReturnType<import("../../../marks/raster.js").default["validateRenderingScales"]>} resolution
 */
export function prepareCanvasRasterTiles(mark, resolution) {
    const opacitySpans = getCanvasOpacitySpans(mark);
    const pickable = mark.isPickingParticipant();
    const signature = [
        resolution?.getMappingRef().get(),
        mark.unitView.getCollector().dataRevision,
        opacitySpans,
        pickable,
    ];
    let cache = tileCaches.get(mark);
    if (!cache || !shallowArrayEquals(signature, cache.signature)) {
        const { readTile, type } = mark.getColorCellBinding();
        const colorize =
            resolution &&
            makeCellColorMapper(resolution.getScale(), type !== "quantitative");
        /** @type {WeakMap<object, ReturnType<typeof paintTile>>} */
        const tiles = new WeakMap();
        cache = {
            signature,
            getTile(datum) {
                let tile = tiles.get(datum);
                if (!tile) {
                    try {
                        tile = paintTile(
                            datum,
                            readTile(datum),
                            colorize,
                            opacitySpans,
                            pickable
                        );
                    } catch (error) {
                        throw new ViewError(error.message, mark.unitView);
                    }
                    tiles.set(datum, tile);
                }
                return tile;
            },
        };
        tileCaches.set(mark, cache);
    }
    return cache.getTile;
}

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRasterCanvas(mark, options) {
    const { context, visibleBounds } = options;
    const resolution = mark.validateRenderingScales();
    const alpha = mark.getUniformOpacity() * options.viewOpacity;
    if (!(alpha > 0)) return 0;
    const getTile = prepareCanvasRasterTiles(mark, resolution);
    const triangle = getRasterTriangle(mark, options.coords, visibleBounds);
    const sourceBounds = triangle?.sourceBounds ?? visibleBounds;
    const placement = triangle ? { ...options, triangle } : options;
    context.save();
    try {
        context.imageSmoothingEnabled = false;
        context.globalAlpha = Math.min(1, alpha);
        if (triangle) {
            const { x1, x2, y1, y2 } = triangle.clip;
            if (x1 >= x2 || y1 >= y2) return 0;
            context.beginPath();
            context.rect(x1, y1, x2 - x1, y2 - y1);
            context.clip();
            const half = triangle.direction * 0.5;
            context.transform(0.5, half, 0.5, -half, 0, triangle.baseline);
        }
        const transform = context.getTransform();
        return visitRasterTiles(mark, placement, (datum, x0, y0, dx, dy) => {
            const bitmap = getTileBitmap(
                getTile(datum),
                context.canvas.ownerDocument
            );
            const x = cropRasterAxis(
                x0,
                dx / bitmap.width,
                bitmap.width,
                sourceBounds.x1,
                sourceBounds.x2
            );
            const y = cropRasterAxis(
                y0,
                dy / bitmap.height,
                bitmap.height,
                sourceBounds.y1,
                sourceBounds.y2
            );
            const signX = Math.sign(dx);
            const signY = Math.sign(dy);
            context.setTransform(transform);
            context.scale(signX, signY);
            for (const row of y) {
                for (const column of x) {
                    context.drawImage(
                        bitmap,
                        column.first,
                        row.first,
                        column.count,
                        row.count,
                        column.origin * signX,
                        row.origin * signY,
                        column.span,
                        row.span
                    );
                }
            }
        });
    } finally {
        context.restore();
    }
}

/**
 * Crop the geometry to the viewport. Stretch each partial edge cell
 * separately so source rectangles still use whole texels.
 * @param {number} start
 * @param {number} step Signed pixel span of one cell.
 * @param {number} count
 * @param {number} min
 * @param {number} max
 */
function cropRasterAxis(start, step, count, min, max) {
    const a = (min - start) / step;
    const b = (max - start) / step;
    const lo = clamp(Math.min(a, b), 0, count);
    const hi = clamp(Math.max(a, b), 0, count);
    const firstWhole = Math.min(Math.ceil(lo), hi);
    const lastWhole = Math.max(firstWhole, Math.floor(hi));
    return [
        [lo, firstWhole],
        [firstWhole, lastWhole],
        [lastWhole, hi],
    ]
        .filter(([from, to]) => from < to)
        .map(([from, to]) => {
            const first = Math.floor(from);
            return {
                first,
                count: Math.ceil(to) - first,
                origin: start + from * step,
                span: (to - from) * Math.abs(step),
            };
        });
}

/**
 * @param {import("../../../types/encoder.js").VegaScale} scale
 * @param {boolean} categorical
 * @returns {(value: string | number | null) => number}
 */
function makeCellColorMapper(scale, categorical) {
    if (categorical) {
        const palette = new Map(
            scale.domain().map((value) => [value, packCssColor(scale(value))])
        );
        return (value) => palette.get(value) ?? 0;
    }
    const logarithmic = scale.type === "log" || scale.type === "sequential-log";
    const domain = logarithmic ? scale.domain() : [];
    const lower = Math.min(domain[0], domain.at(-1));
    const upper = Math.max(domain[0], domain.at(-1));
    const clampLog = logarithmic && "clamp" in scale && scale.clamp();
    return (value) => {
        let number = readNumericRasterCell(value);
        if (!Number.isFinite(number)) return 0;
        // Clamp in data coordinates before the log transform, including zero.
        if (clampLog) number = clamp(number, lower, upper);
        if (logarithmic && Math.sign(number) !== Math.sign(lower)) return 0;
        return packCssColor(scale(number));
    };
}

/**
 * @param {object} datum
 * @param {ReturnType<import("../../../data/rasterTile.js").readRasterTile>} tile
 * @param {((value: string | number | null) => number) | undefined} colorize
 * @param {ReturnType<typeof getCanvasOpacitySpans>} opacitySpans
 * @param {boolean} pickable
 */
function paintTile(datum, tile, colorize, opacitySpans, pickable) {
    const { horizontal, vertical, values } = tile;
    const width = horizontal.count;
    const height = vertical.count;
    const pixels = new ImageData(width, height);
    const alpha = pickable ? new Uint8Array(values.length) : undefined;
    const direct = values instanceof Uint32Array;
    const bytes = new DataView(
        pixels.data.buffer,
        pixels.data.byteOffset,
        pixels.data.byteLength
    );
    /** @param {number} start @param {number} end @param {number} opacity */
    function paint(start, end, opacity) {
        for (let i = start; i < end; i++) {
            let packed = direct ? values[i] : colorize(values[i]);
            if (opacity !== 1) {
                packed =
                    (packed & 0xffffff) |
                    (Math.round((packed >>> 24) * opacity) << 24);
            }
            bytes.setUint32(i * 4, packed, true);
            if (alpha) alpha[i] = packed >>> 24;
        }
    }
    if (opacitySpans) opacitySpans(datum, tile, paint);
    else paint(0, values.length, 1);

    return {
        width,
        height,
        alpha,
        pixels,
        bitmap: /** @type {HTMLCanvasElement | undefined} */ (undefined),
    };
}

/**
 * Picking can arrive before the color pass creates the bitmap.
 * @param {ReturnType<typeof paintTile>} tile
 * @param {Document} document
 */
function getTileBitmap(tile, document) {
    if (!tile.bitmap) {
        const canvas = document.createElement("canvas");
        canvas.width = tile.width;
        canvas.height = tile.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Unable to create a raster tile bitmap.");
        context.putImageData(tile.pixels, 0, 0);
        tile.pixels = undefined;
        tile.bitmap = canvas;
    }
    return tile.bitmap;
}
