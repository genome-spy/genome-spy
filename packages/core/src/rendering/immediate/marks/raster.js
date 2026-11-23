import { readRasterDimension } from "../../../data/rasterTile.js";
import { intersectsBounds } from "../bounds.js";
import { prepareRangeProjection } from "../markEncoding.js";
import { getMarkData, SampleFacetCoordsResolver } from "../markData.js";
import { shallowArrayEquals } from "../../../utils/arrayUtils.js";

/**
 * @param {number} x0
 * @param {number} y0
 * @param {number} dx
 * @param {number} dy
 * @param {number} columns
 * @param {number} rows
 * @param {ReturnType<typeof getRasterTriangle>} [triangle]
 */
export function createRasterCellLookup(
    x0,
    y0,
    dx,
    dy,
    columns,
    rows,
    triangle
) {
    /** @param {number} x @param {number} y */
    return (x, y) => {
        if (triangle) {
            const separation = (y - triangle.baseline) * triangle.direction;
            y = x - separation;
            x += separation;
        }
        const u = (x - x0) / dx;
        const v = (y - y0) / dy;
        return u >= 0 && u < 1 && v >= 0 && v < 1
            ? Math.floor(v * rows) * columns + Math.floor(u * columns)
            : -1;
    };
}

const UNBOUNDED = { x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity };

/**
 * Resolves the cell against the drawing occurrence, including sample placement.
 * The picking pass has already checked clips and visibility.
 * @param {import("../../../view/layout/layoutResult.js").MarkOccurrence[]} occurrences
 * @param {import("../../../marks/raster.js").default} mark
 * @param {object} datum
 * @param {{x: number, y: number}} point
 * @param {import("../../../spec/channel.js").Scalar[]} [facetId]
 * @returns {number | undefined}
 */
export function resolveRasterCell(occurrences, mark, datum, point, facetId) {
    const { column, row } = mark.getColorCellBinding();
    const columns = readRasterDimension(datum, column).count;
    const rows = readRasterDimension(datum, row).count;
    /** @type {SampleFacetCoordsResolver | undefined} */
    let sampleCoords;
    for (let i = occurrences.length - 1; i >= 0; i--) {
        const { coords, options } = occurrences[i];
        if (
            facetId &&
            (!options.facetId || !shallowArrayEquals(facetId, options.facetId))
        )
            continue;
        const occurrence = options.sampleFacetRenderingOptions
            ? (sampleCoords ??= new SampleFacetCoordsResolver()).resolveFacet(
                  coords,
                  options.sampleFacetRenderingOptions
              )
            : coords;
        let index = -1;
        visitRasterTiles(
            mark,
            { coords: occurrence, data: [datum], visibleBounds: UNBOUNDED },
            (_datum, x0, y0, dx, dy, triangle) => {
                index = createRasterCellLookup(
                    x0,
                    y0,
                    dx,
                    dy,
                    columns,
                    rows,
                    triangle
                )(point.x, point.y);
            }
        );
        if (
            index >= 0 &&
            (!options.facetId || getMarkData(mark, options).includes(datum))
        )
            return index;
    }
}

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
    const { row } = mark.getColorCellBinding();
    const xScale = mark.encoders.x.scale;
    let count = 0;
    for (let i = start; i < end; i++) {
        const datum = data[i];
        projectX(datum, x);
        if (triangle) {
            const vertical = readRasterDimension(datum, row);
            y[0] = coords.x + coords.width * xScale(vertical.origin);
            y[1] =
                coords.x +
                coords.width *
                    xScale(vertical.origin + vertical.step * vertical.count);
        } else {
            projectY(datum, y);
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
