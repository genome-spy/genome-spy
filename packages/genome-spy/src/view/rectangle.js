export default class Rectangle {
    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    get x2() {
        return this.x + this.width;
    }

    get y2() {
        return this.y + this.height;
    }

    clone() {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }

    /**
     * Returns a copy of this rectangle translated by the given rectangle.
     *
     * @param {Rectangle} rectangle
     */
    translateBy(rectangle) {
        const translated = this.clone();
        translated.x += rectangle.x;
        translated.y += rectangle.y;
        return translated;
    }
}
