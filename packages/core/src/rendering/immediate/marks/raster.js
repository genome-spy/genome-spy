import { intersectsBounds } from "../bounds.js";
import { prepareRangeProjection } from "../markEncoding.js";

/**
 * Project both tile edges before clipping so partially visible tiles retain
 * their cell positions. Keep the direction of each axis for bitmap drawing.
 *
 * @param {import("../../../marks/raster.js").default} mark
 * @param {{
 *     coords: import("../../../view/layout/rectangle.js").default,
 *     data: object[],
 *     visibleBounds: import("../bounds.js").RenderBounds,
 *     start?: number,
 *     end?: number
 * }} options
 * @param {(datum: object, x0: number, y0: number, dx: number, dy: number) => void} draw
 */
export function visitRasterTiles(mark, options, draw) {
    const { coords, data, visibleBounds } = options;
    const start = options.start ?? 0;
    const end = options.end ?? data.length;
    if (start === end) return 0;

    const projectX = prepareRangeProjection(
        coords,
        mark.encoders,
        "x",
        data[start]
    );
    const projectY = prepareRangeProjection(
        coords,
        mark.encoders,
        "y",
        data[start]
    );
    const x = /** @type {[number, number]} */ ([0, 0]);
    const y = /** @type {[number, number]} */ ([0, 0]);
    let count = 0;
    for (let i = start; i < end; i++) {
        const datum = data[i];
        const [x0, x1] = projectX(datum, x);
        const [y0, y1] = projectY(datum, y);
        const dx = x1 - x0;
        const dy = y1 - y0;
        if (
            !dx ||
            !dy ||
            !Number.isFinite(dx) ||
            !Number.isFinite(dy) ||
            !intersectsBounds(visibleBounds, x0, y0, x1, y1)
        ) {
            continue;
        }
        draw(datum, x0, y0, dx, dy);
        count++;
    }
    return count;
}
