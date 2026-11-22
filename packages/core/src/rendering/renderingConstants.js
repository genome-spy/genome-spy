// GPU-rendered marks are shifted by half a logical pixel so axis-aligned
// rules land inside physical pixels instead of between them.
export const RASTER_COORDINATE_OFFSET = 0.5;

/** @param {number} x @param {number} y @param {number} [dpr] */
export function pickingPixelCenter(x, y, dpr = 1) {
    return {
        x: (Math.floor(x * dpr) + 0.5) / dpr,
        y: (Math.floor(y * dpr) + 0.5) / dpr,
    };
}
