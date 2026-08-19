/**
 * @typedef {object} PointPathSink
 * @property {(x: number, y: number) => void} moveTo
 * @property {(x: number, y: number) => void} lineTo
 * @property {() => void} closePath
 */

/**
 * Traces a non-primitive point shape without allocating intermediate geometry.
 * Circles and squares are handled directly by each output backend.
 *
 * @param {string} shape
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {PointPathSink} path
 * @returns {boolean} Whether the shape is supported
 */
export function tracePointPath(shape, x, y, radius, path) {
    const arm = radius * 0.4;
    const tickHalfWidth = radius * 0.15;
    const triangleHeight = (Math.sqrt(3) * radius) / 2;

    switch (shape) {
        case "diamond":
            path.moveTo(x, y - radius);
            path.lineTo(x + radius, y);
            path.lineTo(x, y + radius);
            path.lineTo(x - radius, y);
            path.closePath();
            return true;
        case "cross":
            path.moveTo(x - arm, y - radius);
            path.lineTo(x + arm, y - radius);
            path.lineTo(x + arm, y - arm);
            path.lineTo(x + radius, y - arm);
            path.lineTo(x + radius, y + arm);
            path.lineTo(x + arm, y + arm);
            path.lineTo(x + arm, y + radius);
            path.lineTo(x - arm, y + radius);
            path.lineTo(x - arm, y + arm);
            path.lineTo(x - radius, y + arm);
            path.lineTo(x - radius, y - arm);
            path.lineTo(x - arm, y - arm);
            path.closePath();
            return true;
        case "triangle-up":
            path.moveTo(x, y - triangleHeight);
            path.lineTo(x + radius, y + triangleHeight);
            path.lineTo(x - radius, y + triangleHeight);
            path.closePath();
            return true;
        case "triangle-right":
            path.moveTo(x + triangleHeight, y);
            path.lineTo(x - triangleHeight, y + radius);
            path.lineTo(x - triangleHeight, y - radius);
            path.closePath();
            return true;
        case "triangle-down":
            path.moveTo(x, y + triangleHeight);
            path.lineTo(x - radius, y - triangleHeight);
            path.lineTo(x + radius, y - triangleHeight);
            path.closePath();
            return true;
        case "triangle-left":
            path.moveTo(x - triangleHeight, y);
            path.lineTo(x + triangleHeight, y - radius);
            path.lineTo(x + triangleHeight, y + radius);
            path.closePath();
            return true;
        case "tick-up":
            traceRectangle(
                path,
                x - tickHalfWidth,
                y - radius,
                x + tickHalfWidth,
                y
            );
            return true;
        case "tick-right":
            traceRectangle(
                path,
                x,
                y - tickHalfWidth,
                x + radius,
                y + tickHalfWidth
            );
            return true;
        case "tick-down":
            traceRectangle(
                path,
                x - tickHalfWidth,
                y,
                x + tickHalfWidth,
                y + radius
            );
            return true;
        case "tick-left":
            traceRectangle(
                path,
                x - radius,
                y - tickHalfWidth,
                x,
                y + tickHalfWidth
            );
            return true;
        case "+":
            path.moveTo(x - radius, y);
            path.lineTo(x + radius, y);
            path.moveTo(x, y - radius);
            path.lineTo(x, y + radius);
            return true;
        case "x":
            path.moveTo(x - radius, y - radius);
            path.lineTo(x + radius, y + radius);
            path.moveTo(x + radius, y - radius);
            path.lineTo(x - radius, y + radius);
            return true;
        default:
            return false;
    }
}

/**
 * @param {PointPathSink} path
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 */
function traceRectangle(path, x1, y1, x2, y2) {
    path.moveTo(x1, y1);
    path.lineTo(x2, y1);
    path.lineTo(x2, y2);
    path.lineTo(x1, y2);
    path.closePath();
}
