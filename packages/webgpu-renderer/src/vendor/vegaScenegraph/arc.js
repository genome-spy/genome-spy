/**
 * Adapted from Vega Scenegraph's SVG arc conversion.
 * https://github.com/vega/vega/blob/79aa7d9de7b09604c5f881a09fd528d2b561d12f/packages/vega-scenegraph/src/path/arc.js
 */

const DEGREES_TO_RADIANS = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

/**
 * @param {number} x
 * @param {number} y
 * @param {number} rx
 * @param {number} ry
 * @param {number} large
 * @param {number} sweep
 * @param {number} rotation
 * @param {number} originX
 * @param {number} originY
 * @returns {number[][]}
 */
export function arcSegments(
    x,
    y,
    rx,
    ry,
    large,
    sweep,
    rotation,
    originX,
    originY
) {
    const angle = rotation * DEGREES_TO_RADIANS;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    rx = Math.abs(rx);
    ry = Math.abs(ry);

    const px = (cos * (originX - x) + sin * (originY - y)) * 0.5;
    const py = (cos * (originY - y) - sin * (originX - x)) * 0.5;
    let scale = (px * px) / (rx * rx) + (py * py) / (ry * ry);
    if (scale > 1) {
        scale = Math.sqrt(scale);
        rx *= scale;
        ry *= scale;
    }

    const a00 = cos / rx;
    const a01 = sin / rx;
    const a10 = -sin / ry;
    const a11 = cos / ry;
    const x0 = a00 * originX + a01 * originY;
    const y0 = a10 * originX + a11 * originY;
    const x1 = a00 * x + a01 * y;
    const y1 = a10 * x + a11 * y;

    const d = (x1 - x0) ** 2 + (y1 - y0) ** 2;
    let factorSquared = 1 / d - 0.25;
    if (factorSquared < 0) {
        factorSquared = 0;
    }
    let factor = Math.sqrt(factorSquared);
    if (sweep == large) {
        factor = -factor;
    }
    const centerX = 0.5 * (x0 + x1) - factor * (y1 - y0);
    const centerY = 0.5 * (y0 + y1) + factor * (x1 - x0);
    const startAngle = Math.atan2(y0 - centerY, x0 - centerX);
    const endAngle = Math.atan2(y1 - centerY, x1 - centerX);
    let arcAngle = endAngle - startAngle;
    if (arcAngle < 0 && sweep === 1) {
        arcAngle += TAU;
    } else if (arcAngle > 0 && sweep === 0) {
        arcAngle -= TAU;
    }

    const count = Math.ceil(Math.abs(arcAngle / (HALF_PI + 0.001)));
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push([
            centerX,
            centerY,
            startAngle + (i * arcAngle) / count,
            startAngle + ((i + 1) * arcAngle) / count,
            rx,
            ry,
            sin,
            cos,
        ]);
    }
    return result;
}

/**
 * @param {number[]} segment
 * @returns {[number, number, number, number, number, number]}
 */
export function arcSegmentToCubic(segment) {
    const [centerX, centerY, angle0, angle1, rx, ry, sin, cos] = segment;
    const a00 = cos * rx;
    const a01 = -sin * ry;
    const a10 = sin * rx;
    const a11 = cos * ry;
    const halfAngle = 0.5 * (angle1 - angle0);
    const halfSin = Math.sin(halfAngle * 0.5);
    const tangent = ((8 / 3) * halfSin * halfSin) / Math.sin(halfAngle);

    const cos0 = Math.cos(angle0);
    const sin0 = Math.sin(angle0);
    const cos1 = Math.cos(angle1);
    const sin1 = Math.sin(angle1);
    const x1 = centerX + cos0 - tangent * sin0;
    const y1 = centerY + sin0 + tangent * cos0;
    const x3 = centerX + cos1;
    const y3 = centerY + sin1;
    const x2 = x3 + tangent * sin1;
    const y2 = y3 - tangent * cos1;

    return [
        a00 * x1 + a01 * y1,
        a10 * x1 + a11 * y1,
        a00 * x2 + a01 * y2,
        a10 * x2 + a11 * y2,
        a00 * x3 + a01 * y3,
        a10 * x3 + a11 * y3,
    ];
}
