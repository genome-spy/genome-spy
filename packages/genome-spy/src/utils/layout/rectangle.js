/**
 * An immutable rectangle
 *
 * @typedef {import("./padding").default } Padding
 */
export default class Rectangle {
    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    constructor(x, y, width, height) {
        /** @readonly */ this.x = x;
        /** @readonly */ this.y = y;
        /** @readonly */ this.width = width;
        /** @readonly */ this.height = height;
    }

    get x2() {
        return this.x + this.width;
    }

    get y2() {
        return this.y + this.height;
    }

    /**
     *
     * @param {Record<string, number>} param0
     */
    modify({ x, y, width, height }) {
        return new Rectangle(
            typeof x === "number" ? x : this.x,
            typeof y === "number" ? y : this.y,
            typeof width === "number" ? width : this.width,
            typeof height === "number" ? height : this.height
        );
    }

    /**
     *
     * @param {number} x
     * @param {number} y
     */
    translate(x, y) {
        return new Rectangle(this.x + x, this.y + y, this.width, this.height);
    }

    /**
     * Returns a copy of this rectangle translated by the given rectangle.
     *
     * @param {Rectangle} rectangle
     */
    translateBy(rectangle) {
        return new Rectangle(
            this.x + rectangle.x,
            this.y + rectangle.y,
            this.width,
            this.height
        );
    }

    /**
     *
     * @param {Padding} padding
     */
    expand(padding, direction = 1) {
        return new Rectangle(
            this.x - padding.left * direction,
            this.y - padding.top * direction,
            this.width + padding.width * direction,
            this.height + padding.height * direction
        );
    }

    /**
     *
     * @param {Padding} padding
     */
    shrink(padding) {
        return this.expand(padding, -1);
    }

    /**
     * Tests whether the rectangle contains the given point.
     *
     * @param {number} x
     * @param {number} y
     */
    containsPoint(x, y) {
        return x >= this.x && x < this.x2 && y >= this.y && y < this.y2;
    }
}
