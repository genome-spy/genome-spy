export default class Point {
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
     *
     * @param {Point} point
     */
    equals(point) {
        if (!point) {
            return false;
        }

        return point === this || (point.x === this.x && point.y === this.y);
    }
}
