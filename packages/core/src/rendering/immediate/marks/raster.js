import { readRasterDimension } from "../../../data/rasterTile.js";
import { intersectsBounds } from "../bounds.js";
import { encodeNumber, prepareRangeProjection } from "../markEncoding.js";

/**
 * Restrict the projection to the track and bound that clip in source pixels.
 * Both source axes use the track's horizontal locus scale.
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../../../view/layout/rectangle.js").default} coords
 * @param {import("../bounds.js").RenderBounds} visibleBounds
 */
export function getRasterTriangle(mark, coords, visibleBounds) {
    if (!mark.isTriangle) return;
    const baseline = coords.y2;
    const direction = mark.encoders.x.scale.props.reverse ? -1 : 1;
    const clip = {
        x1: Math.max(visibleBounds.x1, coords.x),
        y1: Math.max(visibleBounds.y1, coords.y),
        x2: Math.min(visibleBounds.x2, coords.x2),
        y2: Math.min(visibleBounds.y2, baseline),
    };
    const near = (clip.y2 - baseline) * direction;
    const far = (clip.y1 - baseline) * direction;
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    const sourceBounds = {
        x1: clip.x1 + lo,
        y1: clip.x1 - hi,
        x2: clip.x2 + hi,
        y2: clip.x2 - lo,
    };
    return { baseline, direction, clip, sourceBounds };
}

/**
 * @param {number} x0
 * @param {number} y0
 * @param {number} dx
 * @param {number} dy
 * @param {ReturnType<typeof getRasterTriangle>} triangle
 */
export function getRasterTileBounds(x0, y0, dx, dy, triangle) {
    const left = Math.min(x0, x0 + dx);
    const right = Math.max(x0, x0 + dx);
    const top = Math.min(y0, y0 + dy);
    const bottom = Math.max(y0, y0 + dy);
    if (!triangle) return { x1: left, x2: right, y1: top, y2: bottom };

    const { baseline, direction } = triangle;
    const a = (direction * (left - bottom)) / 2;
    const b = (direction * (right - top)) / 2;
    return {
        x1: (left + top) / 2,
        x2: (right + bottom) / 2,
        y1: baseline + Math.min(a, b),
        y2: baseline + Math.max(a, b),
    };
}

/**
 * Project both tile edges before clipping so partially visible tiles retain
 * their cell positions. Keep the direction of each axis for bitmap drawing.
 *
 * @param {import("../../../marks/raster.js").default} mark
 * @param {{
 *     coords: import("../../../view/layout/rectangle.js").default,
 *     data: object[],
 *     visibleBounds: import("../bounds.js").RenderBounds,
 *     triangle?: ReturnType<typeof getRasterTriangle>,
 *     start?: number,
 *     end?: number
 * }} options
 * @param {(datum: object, x0: number, y0: number, dx: number, dy: number, triangle?: ReturnType<typeof getRasterTriangle>) => void} draw
 */
export function visitRasterTiles(mark, options, draw) {
    const { coords, data, visibleBounds } = options;
    const triangle =
        options.triangle ?? getRasterTriangle(mark, coords, visibleBounds);
    const start = options.start ?? 0;
    const end = options.end ?? data.length;
    if (start === end) return 0;

    const projectX = prepareRangeProjection(
        coords,
        mark.encoders,
        "x",
        data[start]
    );
    const projectY = triangle
        ? undefined
        : prepareRangeProjection(coords, mark.encoders, "y", data[start]);
    const x = /** @type {[number, number]} */ ([0, 0]);
    const y = /** @type {[number, number]} */ ([0, 0]);
    const { column, row } = mark.getColorCellBinding();
    const xScale = mark.encoders.x.scale;
    const size = mark.isIcon ? mark.encoders.size : undefined;
    let count = 0;
    for (let i = start; i < end; i++) {
        const datum = data[i];
        projectX(datum, x);
        if (triangle) {
            const vertical = readRasterDimension(datum, row, true);
            y[0] = coords.x + coords.width * xScale(vertical.origin);
            y[1] =
                coords.x +
                coords.width *
                    xScale(vertical.origin + vertical.step * vertical.count);
        } else {
            projectY(datum, y);
        }
        if (size) {
            const pitch = Math.sqrt(encodeNumber(size, datum));
            if (!(pitch > 0) || !Number.isFinite(pitch)) continue;
            const halfWidth =
                (readRasterDimension(datum, column).count * pitch) / 2;
            const halfHeight =
                (readRasterDimension(datum, row).count * pitch) / 2;
            x[0] -= halfWidth;
            x[1] += halfWidth;
            y[0] -= halfHeight;
            y[1] += halfHeight;
        }
        const [x0, x1] = x;
        const [y0, y1] = y;
        const dx = x1 - x0;
        const dy = y1 - y0;
        if (
            !dx ||
            !dy ||
            !Number.isFinite(dx) ||
            !Number.isFinite(dy) ||
            !intersectsBounds(
                triangle?.sourceBounds ?? visibleBounds,
                x0,
                y0,
                x1,
                y1
            )
        ) {
            continue;
        }
        draw(datum, x0, y0, dx, dy, triangle);
        count++;
    }
    return count;
}
