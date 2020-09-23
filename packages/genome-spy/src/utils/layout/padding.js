/**
 * A class for handing paddings, borders, margins, etc.
 *
 * @typedef {"top" | "right" | "bottom" | "left" } Side
 */
export default class Padding {
    /**
     * @param {Record<Side, number>} paddings
     */
    constructor(paddings) {
        this.top = paddings.top || 0;
        this.right = paddings.right || 0;
        this.bottom = paddings.bottom || 0;
        this.left = paddings.left || 0;
    }

    /**
     * Returns the sum of left and right
     */
    get width() {
        return this.left + this.right;
    }

    /**
     * Returns the sum of top and bottom
     */
    get height() {
        return this.top + this.bottom;
    }

    clone() {
        return new Padding(this);
    }

    /**
     *
     * @param {number} value
     */
    static createUniformPadding(value) {
        return new Padding({
            top: value,
            right: value,
            bottom: value,
            left: value
        });
    }
}
