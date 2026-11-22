import { readNumericRasterCell } from "../../../data/rasterTile.js";
import clamp from "../../../utils/clamp.js";
import ViewError from "../../../view/viewError.js";
import { packCssColor } from "../../color.js";
import { encodeNumber } from "../../immediate/markEncoding.js";
import {
    getRasterTriangle,
    visitRasterTiles,
} from "../../immediate/marks/raster.js";

/**
 * A collector publication replaces its tile payloads. Mapping updates can
 * mutate the Vega scale in place, so use the completed mapping snapshot.
 * @type {WeakMap<import("../../../marks/raster.js").default, {
 *     revision: number,
 *     mapping: object | undefined,
 *     cellOpacity: import("../../../marks/rasterOpacity.js").ReadCellOpacity | undefined,
 *     colorize: ReturnType<typeof makeCellColorMapper> | undefined,
 *     tiles: WeakMap<object, HTMLCanvasElement>
 * }>}
 */
const bitmaps = new WeakMap();

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRasterCanvas(mark, options) {
    const { context, visibleBounds } = options;
    const resolution = mark.validateRenderingScales();
    const firstDatum = options.data[options.start ?? 0];
    const cellOpacity = mark.getCellOpacityReader()?.();
    const opacity = cellOpacity ? undefined : mark.encoders.opacity;
    const constantOpacity = opacity?.constant
        ? encodeNumber(opacity, firstDatum)
        : 1;
    if (!(constantOpacity * options.viewOpacity > 0)) return 0;

    const mapping = resolution?.getMappingRef().get();
    const revision = mark.unitView.getCollector().dataRevision;
    const { readTile, type } = mark.getColorCellBinding();
    let cache = bitmaps.get(mark);
    if (
        !cache ||
        cache.mapping !== mapping ||
        cache.revision !== revision ||
        cache.cellOpacity !== cellOpacity
    ) {
        cache = {
            mapping,
            revision,
            cellOpacity,
            colorize:
                resolution &&
                makeCellColorMapper(
                    resolution.getScale(),
                    type !== "quantitative"
                ),
            tiles: new WeakMap(),
        };
        bitmaps.set(mark, cache);
    }

    const triangle = getRasterTriangle(mark, options.coords, visibleBounds);
    const sourceBounds = triangle?.sourceBounds ?? visibleBounds;
    const placement = triangle ? { ...options, triangle } : options;
    context.save();
    try {
        context.imageSmoothingEnabled = false;
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
            const alpha =
                options.viewOpacity *
                (opacity && !opacity.constant
                    ? encodeNumber(opacity, datum)
                    : constantOpacity);
            if (!(alpha > 0)) return;

            let bitmap = cache.tiles.get(datum);
            if (!bitmap) {
                try {
                    const tile = readTile(datum);
                    bitmap = createTileBitmap(
                        context.canvas.ownerDocument,
                        tile,
                        cache.colorize,
                        cellOpacity?.(datum, tile)
                    );
                } catch (error) {
                    throw new ViewError(error.message, mark.unitView);
                }
                cache.tiles.set(datum, bitmap);
            }
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
            context.globalAlpha = Math.min(1, alpha);
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
export function makeCellColorMapper(scale, categorical) {
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
 * @param {Document} document
 * @param {ReturnType<import("../../../data/rasterTile.js").readRasterTile>} tile
 * @param {((value: string | number | null) => number) | undefined} colorize
 * @param {Float32Array} [opacity]
 */
function createTileBitmap(
    document,
    { horizontal, vertical, values },
    colorize,
    opacity
) {
    const bitmap = document.createElement("canvas");
    bitmap.width = horizontal.count;
    bitmap.height = vertical?.count ?? 1;
    const context = bitmap.getContext("2d");
    if (!context) throw new Error("Unable to create a raster tile bitmap.");
    const pixels = context.createImageData(bitmap.width, bitmap.height);
    const bytes = new DataView(
        pixels.data.buffer,
        pixels.data.byteOffset,
        pixels.data.byteLength
    );
    for (let i = 0; i < values.length; i++) {
        if (opacity?.[i] === 0) continue;
        let packed =
            values instanceof Uint32Array ? values[i] : colorize(values[i]);
        if (opacity) {
            packed =
                (packed & 0xffffff) |
                (Math.round((packed >>> 24) * opacity[i]) << 24);
        }
        bytes.setUint32(i * 4, packed, true);
    }
    context.putImageData(pixels, 0, 0);
    return bitmap;
}
