const MAX_CUBIC_SUBDIVISION_DEPTH = 12;
const DEFAULT_CUBIC_TOLERANCE = 0.5;

/**
 * Rasterizes conservative picking geometry into a software ID buffer.
 */
export default class SoftwarePickingRasterizer {
    /** @type {number[]} */
    #cubicStack = [];

    /** @type {number[]} */
    #intersections = [];

    /** @type {[number, number, number, number]} */
    #clippedSegment = [0, 0, 0, 0];

    #clipLeft = 0;
    #clipTop = 0;
    #clipRight = 0;
    #clipBottom = 0;

    #rectangles = 0;
    #squares = 0;
    #polygons = 0;
    #segments = 0;
    #cubics = 0;
    #spans = 0;

    /**
     * @param {import("./softwarePickingBuffer.js").default} buffer
     */
    constructor(buffer) {
        this.buffer = buffer;
        this.resetClip();
    }

    resetClip() {
        this.#clipLeft = 0;
        this.#clipTop = 0;
        this.#clipRight = this.buffer.width;
        this.#clipBottom = this.buffer.height;
    }

    resetStatistics() {
        this.#rectangles = 0;
        this.#squares = 0;
        this.#polygons = 0;
        this.#segments = 0;
        this.#cubics = 0;
        this.#spans = 0;
    }

    /**
     * @returns {{rectangles: number, squares: number, polygons: number, segments: number, cubics: number, spans: number}}
     */
    getStatistics() {
        return {
            rectangles: this.#rectangles,
            squares: this.#squares,
            polygons: this.#polygons,
            segments: this.#segments,
            cubics: this.#cubics,
            spans: this.#spans,
        };
    }

    /**
     * Sets a conservative rectangular clip in logical coordinates.
     *
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     */
    setClip(x1, y1, x2, y2) {
        if (
            !Number.isFinite(x1) ||
            !Number.isFinite(y1) ||
            !Number.isFinite(x2) ||
            !Number.isFinite(y2)
        ) {
            throw new RangeError("Software picking clip must be finite.");
        }
        this.#clipLeft = clamp(
            Math.floor(Math.min(x1, x2)),
            0,
            this.buffer.width
        );
        this.#clipTop = clamp(
            Math.floor(Math.min(y1, y2)),
            0,
            this.buffer.height
        );
        this.#clipRight = clamp(
            Math.ceil(Math.max(x1, x2)),
            this.#clipLeft,
            this.buffer.width
        );
        this.#clipBottom = clamp(
            Math.ceil(Math.max(y1, y2)),
            this.#clipTop,
            this.buffer.height
        );
    }

    /**
     * @param {number} id
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    fillRect(id, x, y, width, height) {
        this.#rectangles++;
        this.#fillRect(id, x, y, width, height);
    }

    /**
     * @param {number} id
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    #fillRect(id, x, y, width, height) {
        const x2 = x + width;
        const y2 = y + height;
        if (
            !Number.isFinite(x2) ||
            !Number.isFinite(y2) ||
            width == 0 ||
            height == 0
        ) {
            return;
        }

        const left = Math.max(this.#clipLeft, Math.floor(Math.min(x, x2)));
        const top = Math.max(this.#clipTop, Math.floor(Math.min(y, y2)));
        const right = Math.min(this.#clipRight, Math.ceil(Math.max(x, x2)));
        const bottom = Math.min(this.#clipBottom, Math.ceil(Math.max(y, y2)));
        if (left >= right || top >= bottom) {
            return;
        }

        for (let row = top; row < bottom; row++) {
            this.#fillSpan(id, row, left, right);
        }
    }

    /**
     * @param {number} id
     * @param {number} x
     * @param {number} y
     * @param {number} halfSize
     */
    fillSquare(id, x, y, halfSize) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !(halfSize > 0) ||
            !Number.isFinite(halfSize)
        ) {
            return;
        }
        this.#squares++;
        this.#fillSquare(id, x, y, halfSize);
    }

    /**
     * Rasterizes a convex polygon represented by flat x/y coordinate pairs.
     * The one-pixel edge pass makes boundary coverage conservative.
     *
     * @param {number} id
     * @param {ArrayLike<number>} points
     */
    fillConvexPolygon(id, points) {
        if (points.length < 6 || points.length % 2 != 0) {
            throw new Error(
                "A convex picking polygon requires at least three x/y pairs."
            );
        }
        this.#polygons++;

        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 1; i < points.length; i += 2) {
            const y = points[i];
            if (!Number.isFinite(points[i - 1]) || !Number.isFinite(y)) {
                return;
            }
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        const firstRow = Math.max(this.#clipTop, Math.floor(minY));
        const lastRow = Math.min(this.#clipBottom, Math.ceil(maxY));
        const intersections = this.#intersections;
        for (let row = firstRow; row < lastRow; row++) {
            const scanY = row + 0.5;
            intersections.length = 0;
            let previous = points.length - 2;
            for (let current = 0; current < points.length; current += 2) {
                const ax = points[previous];
                const ay = points[previous + 1];
                const bx = points[current];
                const by = points[current + 1];
                if (
                    (ay <= scanY && scanY < by) ||
                    (by <= scanY && scanY < ay)
                ) {
                    intersections.push(
                        ax + ((scanY - ay) * (bx - ax)) / (by - ay)
                    );
                }
                previous = current;
            }

            intersections.sort((a, b) => a - b);
            for (let i = 0; i + 1 < intersections.length; i += 2) {
                const left = Math.max(
                    this.#clipLeft,
                    Math.floor(intersections[i])
                );
                const right = Math.min(
                    this.#clipRight,
                    Math.ceil(intersections[i + 1])
                );
                if (left < right) {
                    this.#fillSpan(id, row, left, right);
                }
            }
        }

        let previous = points.length - 2;
        for (let current = 0; current < points.length; current += 2) {
            this.strokeSegment(
                id,
                points[previous],
                points[previous + 1],
                points[current],
                points[current + 1],
                1
            );
            previous = current;
        }
    }

    /**
     * @param {number} id
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} width
     * @param {(x: number, y: number) => boolean} [contains]
     */
    strokeSegment(id, x1, y1, x2, y2, width, contains) {
        if (!(width > 0) || !Number.isFinite(width)) {
            return;
        }
        this.#segments++;
        const halfWidth = width / 2;
        const clipped = this.#clippedSegment;
        if (
            !clipSegment(
                x1,
                y1,
                x2,
                y2,
                this.#clipLeft - halfWidth,
                this.#clipTop - halfWidth,
                this.#clipRight + halfWidth,
                this.#clipBottom + halfWidth,
                clipped
            )
        ) {
            return;
        }

        const dx = clipped[2] - clipped[0];
        const dy = clipped[3] - clipped[1];
        const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
        if (steps == 0) {
            this.#fillSquare(id, clipped[0], clipped[1], halfWidth, contains);
            return;
        }

        for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            this.#fillSquare(
                id,
                clipped[0] + dx * t,
                clipped[1] + dy * t,
                halfWidth,
                contains
            );
        }
    }

    /**
     * @param {number} id
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} x3
     * @param {number} y3
     * @param {number} x4
     * @param {number} y4
     * @param {number} width
     * @param {number} [tolerance]
     * @param {(x: number, y: number) => boolean} [contains] Optional pixel-center coverage test.
     */
    strokeCubic(
        id,
        x1,
        y1,
        x2,
        y2,
        x3,
        y3,
        x4,
        y4,
        width,
        tolerance = DEFAULT_CUBIC_TOLERANCE,
        contains
    ) {
        if (
            !(width > 0) ||
            !Number.isFinite(width) ||
            !(tolerance > 0) ||
            !Number.isFinite(tolerance) ||
            !Number.isFinite(x1) ||
            !Number.isFinite(y1) ||
            !Number.isFinite(x2) ||
            !Number.isFinite(y2) ||
            !Number.isFinite(x3) ||
            !Number.isFinite(y3) ||
            !Number.isFinite(x4) ||
            !Number.isFinite(y4)
        ) {
            return;
        }
        this.#cubics++;

        const stack = this.#cubicStack;
        stack.length = 0;
        stack.push(x1, y1, x2, y2, x3, y3, x4, y4, 0);
        while (stack.length) {
            const depth = /** @type {number} */ (stack.pop());
            const by4 = /** @type {number} */ (stack.pop());
            const bx4 = /** @type {number} */ (stack.pop());
            const by3 = /** @type {number} */ (stack.pop());
            const bx3 = /** @type {number} */ (stack.pop());
            const by2 = /** @type {number} */ (stack.pop());
            const bx2 = /** @type {number} */ (stack.pop());
            const by1 = /** @type {number} */ (stack.pop());
            const bx1 = /** @type {number} */ (stack.pop());
            if (
                depth >= MAX_CUBIC_SUBDIVISION_DEPTH ||
                isCubicFlatEnough(
                    bx1,
                    by1,
                    bx2,
                    by2,
                    bx3,
                    by3,
                    bx4,
                    by4,
                    tolerance
                )
            ) {
                this.strokeSegment(id, bx1, by1, bx4, by4, width, contains);
                continue;
            }

            const x12 = (bx1 + bx2) / 2;
            const y12 = (by1 + by2) / 2;
            const x23 = (bx2 + bx3) / 2;
            const y23 = (by2 + by3) / 2;
            const x34 = (bx3 + bx4) / 2;
            const y34 = (by3 + by4) / 2;
            const x123 = (x12 + x23) / 2;
            const y123 = (y12 + y23) / 2;
            const x234 = (x23 + x34) / 2;
            const y234 = (y23 + y34) / 2;
            const middleX = (x123 + x234) / 2;
            const middleY = (y123 + y234) / 2;
            const nextDepth = depth + 1;

            stack.push(
                middleX,
                middleY,
                x234,
                y234,
                x34,
                y34,
                bx4,
                by4,
                nextDepth,
                bx1,
                by1,
                x12,
                y12,
                x123,
                y123,
                middleX,
                middleY,
                nextDepth
            );
        }
    }

    /**
     * @param {number} id
     * @param {number} row
     * @param {number} left Inclusive.
     * @param {number} right Exclusive.
     */
    #fillSpan(id, row, left, right) {
        this.#spans++;
        const offset = row * this.buffer.width;
        this.buffer.ids.fill(id >>> 0, offset + left, offset + right);
    }

    /**
     * Small picking footprints are faster with direct stores than repeated
     * TypedArray.fill() calls. Wide spans retain the native bulk operation.
     *
     * @param {number} id
     * @param {number} x
     * @param {number} y
     * @param {number} halfSize
     * @param {(x: number, y: number) => boolean} [contains]
     */
    #fillSquare(id, x, y, halfSize, contains) {
        const left = Math.max(this.#clipLeft, Math.floor(x - halfSize));
        const top = Math.max(this.#clipTop, Math.floor(y - halfSize));
        const right = Math.min(this.#clipRight, Math.ceil(x + halfSize));
        const bottom = Math.min(this.#clipBottom, Math.ceil(y + halfSize));
        if (left >= right || top >= bottom) {
            return;
        }

        const value = id >>> 0;
        const ids = this.buffer.ids;
        const rowWidth = this.buffer.width;
        const span = right - left;
        for (let row = top; row < bottom; row++) {
            this.#spans++;
            const start = row * rowWidth + left;
            const end = start + span;
            if (contains) {
                for (let column = left; column < right; column++) {
                    if (contains(column + 0.5, row + 0.5)) {
                        ids[row * rowWidth + column] = value;
                    }
                }
            } else if (span > 16) {
                ids.fill(value, start, end);
            } else {
                for (let offset = start; offset < end; offset++) {
                    ids[offset] = value;
                }
            }
        }
    }
}

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
function clipSegment(x1, y1, x2, y2, left, top, right, bottom, result) {
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

/**
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} x3
 * @param {number} y3
 * @param {number} x4
 * @param {number} y4
 * @param {number} tolerance
 * @returns {boolean}
 */
function isCubicFlatEnough(x1, y1, x2, y2, x3, y3, x4, y4, tolerance) {
    const dx = x4 - x1;
    const dy = y4 - y1;
    const chordLengthSquared = dx * dx + dy * dy;
    const toleranceSquared = tolerance * tolerance;
    if (chordLengthSquared == 0) {
        const d2 = squaredDistance(x1, y1, x2, y2);
        const d3 = squaredDistance(x1, y1, x3, y3);
        return Math.max(d2, d3) <= toleranceSquared;
    }

    const cross2 = dy * (x2 - x1) - dx * (y2 - y1);
    const cross3 = dy * (x3 - x1) - dx * (y3 - y1);
    return (
        Math.max(cross2 * cross2, cross3 * cross3) <=
        toleranceSquared * chordLengthSquared
    );
}

/**
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
function squaredDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
