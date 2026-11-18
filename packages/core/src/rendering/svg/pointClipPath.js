import { tracePointPath } from "../immediate/geometry/pointPath.js";

/**
 * Normalizes a named polygon to its actual bounds, including asymmetric ticks.
 * SVG owns the clip; the backend-neutral tracer remains the geometry source.
 *
 * @param {string} shape
 * @returns {string | undefined}
 */
export function pointClipPath(shape) {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    const include = (/** @type {number} */ x, /** @type {number} */ y) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    };
    if (
        !tracePointPath(shape, 0, 0, 1, {
            moveTo: include,
            lineTo: include,
            closePath() {},
        })
    ) {
        return undefined;
    }

    let path = "";
    const point = (/** @type {number} */ x, /** @type {number} */ y) =>
        `${(x - minX) / (maxX - minX)} ${(y - minY) / (maxY - minY)}`;
    tracePointPath(shape, 0, 0, 1, {
        moveTo(x, y) {
            path += `M ${point(x, y)}`;
        },
        lineTo(x, y) {
            path += ` L ${point(x, y)}`;
        },
        closePath() {
            path += " Z";
        },
    });
    return path;
}
