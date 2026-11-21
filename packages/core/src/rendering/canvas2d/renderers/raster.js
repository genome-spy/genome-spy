import { readNumericRasterCell } from "../../../data/rasterTile.js";
import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import clamp from "../../../utils/clamp.js";
import ViewError from "../../../view/viewError.js";
import { packCssColor } from "../../color.js";
import { encodeNumber } from "../../immediate/markEncoding.js";
import { visitRasterTiles } from "../../immediate/marks/raster.js";

/**
 * A collector publication replaces its tile payloads. Mapping updates can
 * mutate the Vega scale in place, so use the completed mapping snapshot.
 * @type {WeakMap<import("../../../marks/raster.js").default, {
 *     revision: number,
 *     mapping: object,
 *     cellOpacity: import("../../../marks/raster.js").CellOpacity | undefined,
 *     colorize: ReturnType<typeof makeCellColorMapper>,
 *     tiles: WeakMap<object, HTMLCanvasElement>
 * }>}
 */
const bitmaps = new WeakMap();

/**
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("./index.js").CanvasMarkRenderingOptions} options
 */
export function renderRasterCanvas(mark, options) {
    const { context } = options;
    const resolution = mark.validateRenderingScales();
    const firstDatum = options.data[options.start ?? 0];
    const cellOpacity = mark.getCellOpacityReader()?.(firstDatum);
    const opacity = cellOpacity ? undefined : mark.encoders.opacity;
    const constantOpacity = opacity?.constant
        ? encodeNumber(opacity, firstDatum)
        : 1;
    if (!(constantOpacity * options.viewOpacity > 0)) return 0;

    const mapping = resolution.getMappingRef().get();
    const revision = mark.unitView.getCollector().dataRevision;
    const { readTile, type } = mark.getColorCellBinding();
    let cache = bitmaps.get(mark);
    if (
        !cache ||
        cache.mapping !== mapping ||
        cache.revision !== revision ||
        (cellOpacity &&
            (!cache.cellOpacity ||
                !shallowArrayEquals(cellOpacity, cache.cellOpacity)))
    ) {
        cache = {
            mapping,
            revision,
            cellOpacity,
            colorize: makeCellColorMapper(
                resolution.getScale(),
                type !== "quantitative",
                cellOpacity
            ),
            tiles: new WeakMap(),
        };
        bitmaps.set(mark, cache);
    }

    const transform = context.getTransform();
    context.save();
    try {
        context.imageSmoothingEnabled = false;
        return visitRasterTiles(mark, options, (datum, x0, y0, dx, dy) => {
            const alpha =
                options.viewOpacity *
                (opacity && !opacity.constant
                    ? encodeNumber(opacity, datum)
                    : constantOpacity);
            if (!(alpha > 0)) return;

            let bitmap = cache.tiles.get(datum);
            if (!bitmap) {
                try {
                    bitmap = createTileBitmap(
                        context.canvas.ownerDocument,
                        readTile(datum),
                        cache.colorize
                    );
                } catch (error) {
                    throw new ViewError(error.message, mark.unitView);
                }
                cache.tiles.set(datum, bitmap);
            }
            context.setTransform(transform);
            context.globalAlpha = Math.min(1, alpha);
            context.translate(x0, y0);
            context.scale(Math.sign(dx), Math.sign(dy));
            context.drawImage(bitmap, 0, 0, Math.abs(dx), Math.abs(dy));
        });
    } finally {
        context.restore();
    }
}

/**
 * @param {import("../../../types/encoder.js").VegaScale} scale
 * @param {boolean} categorical
 * @param {import("../../../marks/raster.js").CellOpacity} [cellOpacity]
 * @returns {(value: string | number | null) => number}
 */
function makeCellColorMapper(scale, categorical, cellOpacity) {
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
    const [min, max, matching, fallback] = cellOpacity ?? [];
    return (value) => {
        let number = readNumericRasterCell(value);
        if (!Number.isFinite(number)) return 0;
        const alpha = cellOpacity
            ? min <= number && number < max
                ? matching
                : fallback
            : 1;
        if (!(alpha > 0)) return 0;
        // Clamp in data coordinates before the log transform, including zero.
        if (clampLog) number = clamp(number, lower, upper);
        if (logarithmic && Math.sign(number) !== Math.sign(lower)) return 0;
        const packed = packCssColor(scale(number));
        return alpha === 1
            ? packed
            : (packed & 0xffffff) | (Math.round((packed >>> 24) * alpha) << 24);
    };
}

/**
 * @param {Document} document
 * @param {ReturnType<import("../../../data/rasterTile.js").readRasterTile>} tile
 * @param {(value: string | number | null) => number} colorize
 */
function createTileBitmap(
    document,
    { horizontal, vertical, values },
    colorize
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
        bytes.setUint32(i * 4, colorize(values[i]), true);
    }
    context.putImageData(pixels, 0, 0);
    return bitmap;
}
