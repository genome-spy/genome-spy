/**
 * A class for handing paddings, borders, margins, etc.
 *
 * @typedef {"top" | "right" | "bottom" | "left" } Side
 */
export default class Padding {
    /**
     * @param {number} top
     * @param {number} right
     * @param {number} bottom
     * @param {number} left
     */
    constructor(top, right, bottom, left) {
        /** @readonly */ this.top = top || 0;
        /** @readonly */ this.right = right || 0;
        /** @readonly */ this.bottom = bottom || 0;
        /** @readonly */ this.left = left || 0;
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

    /**
     * @param {number} amount In pixels
     */
    expand(amount) {
        if (amount <= 0) {
            return this;
        }

        return new Padding(
            this.top + amount,
            this.right + amount,
            this.bottom + amount,
            this.left + amount
        );
    }

    /**
     *
     * @param {Padding} padding padding to add
     */
    add(padding) {
        return new Padding(
            this.top + padding.top,
            this.right + padding.right,
            this.bottom + padding.bottom,
            this.left + padding.left
        );
    }

    /**
     *
     * @param {any} config
     */
    static createFromConfig(config) {
        if (typeof config == "number") {
            return this.createUniformPadding(config);
        } else if (config) {
            return this.createFromRecord(config);
        } else {
            return zeroPadding;
        }
    }

    /**
     * @param {Record<Side, number>} paddings
     */
    static createFromRecord(paddings) {
        return new Padding(
            paddings.top,
            paddings.right,
            paddings.bottom,
            paddings.left
        );
    }

    /**
     * Returns a zeroed padding.
     */
    static zero() {
        return zeroPadding;
    }

    /**
     *
     * @param {number} value
     */
    static createUniformPadding(value) {
        return new Padding(value, value, value, value);
    }
}

const zeroPadding = Padding.createUniformPadding(0);
