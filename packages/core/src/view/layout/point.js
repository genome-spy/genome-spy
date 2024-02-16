/*
 * Hmm. This looks quite a bit like a two-dimensional vector.
 * Maybe we should use a vector instead?
 */
export default class Point {
    /**
     * @param {MouseEvent} event
     */
    static fromMouseEvent(event) {
        return new Point(event.clientX, event.clientY);
    }

    /**
     *
     * @param {number} x
     * @param {number} y
     */
    constructor(x, y) {
        /** @readonly */ this.x = x;
        /** @readonly */ this.y = y;
    }

    /**
     * @param {Point} point
     */
    subtract(point) {
        return new Point(this.x - point.x, this.y - point.y);
    }

    /**
     * @param {Point} point
     */
    add(point) {
        return new Point(this.x - point.x, this.y - point.y);
    }

    /**
     * @param {Point} point
     */
    equals(point) {
        if (!point) {
            return false;
        }

        return point === this || (point.x === this.x && point.y === this.y);
    }
}
