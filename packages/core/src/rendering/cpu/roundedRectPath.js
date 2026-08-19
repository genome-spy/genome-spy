/**
 * @typedef {object} RoundedRectPathSink
 * @property {(x: number, y: number) => void} moveTo
 * @property {(x: number, y: number) => void} horizontalTo
 * @property {(x: number, y: number) => void} verticalTo
 * @property {(radius: number, x: number, y: number, sharpX: number, sharpY: number) => void} corner
 * @property {() => void} closePath
 */

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {{topLeft: number, topRight: number, bottomRight: number, bottomLeft: number}} radii
 * @param {RoundedRectPathSink} path
 */
export function traceRoundedRectPath(x, y, width, height, radii, path) {
    const x2 = x + width;
    const y2 = y + height;
    const { topLeft, topRight, bottomRight, bottomLeft } = radii;

    path.moveTo(x + topLeft, y);
    path.horizontalTo(x2 - topRight, y);
    path.corner(topRight, x2, y + topRight, x2, y);
    path.verticalTo(x2, y2 - bottomRight);
    path.corner(bottomRight, x2 - bottomRight, y2, x2, y2);
    path.horizontalTo(x + bottomLeft, y2);
    path.corner(bottomLeft, x, y2 - bottomLeft, x, y2);
    path.verticalTo(x, y + topLeft);
    path.corner(topLeft, x + topLeft, y, x, y);
    path.closePath();
}

/**
 * @param {{topLeft: number, topRight: number, bottomRight: number, bottomLeft: number}} radii
 */
export function hasRoundedCorners(radii) {
    return (
        radii.topLeft != 0 ||
        radii.topRight != 0 ||
        radii.bottomRight != 0 ||
        radii.bottomLeft != 0
    );
}
