/**
 * Clips a segment using the Liang-Barsky algorithm.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} left
 * @param {number} top
 * @param {number} right
 * @param {number} bottom
 * @param {[number, number, number, number]} result
 * @returns {boolean}
 */
export default function clipSegment(
    x1,
    y1,
    x2,
    y2,
    left,
    top,
    right,
    bottom,
    result
) {
    if (
        !Number.isFinite(x1) ||
        !Number.isFinite(y1) ||
        !Number.isFinite(x2) ||
        !Number.isFinite(y2)
    ) {
        return false;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    let start = 0;
    let end = 1;

    if (dx == 0) {
        if (x1 < left || x1 > right) {
            return false;
        }
    } else {
        const leftRatio = (left - x1) / dx;
        const rightRatio = (right - x1) / dx;
        start = Math.max(start, Math.min(leftRatio, rightRatio));
        end = Math.min(end, Math.max(leftRatio, rightRatio));
    }
    if (dy == 0) {
        if (y1 < top || y1 > bottom) {
            return false;
        }
    } else {
        const topRatio = (top - y1) / dy;
        const bottomRatio = (bottom - y1) / dy;
        start = Math.max(start, Math.min(topRatio, bottomRatio));
        end = Math.min(end, Math.max(topRatio, bottomRatio));
    }
    if (start > end) {
        return false;
    }

    result[0] = x1 + start * dx;
    result[1] = y1 + start * dy;
    result[2] = x1 + end * dx;
    result[3] = y1 + end * dy;
    return true;
}
