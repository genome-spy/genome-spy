/**
 * A class for handing paddings, borders, margins, etc.
 *
 * @typedef {import("../../spec/view.js").Paddings} Paddings
 * @typedef {import("../../spec/view.js").PaddingConfig} PaddingConfig
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
     * @param {Padding} padding padding to subtract
     */
    subtract(padding) {
        return new Padding(
            this.top - padding.top,
            this.right - padding.right,
            this.bottom - padding.bottom,
            this.left - padding.left
        );
    }

    /**
     *
     * @param {Padding} padding padding to union
     */
    union(padding) {
        return new Padding(
            Math.max(this.top, padding.top),
            Math.max(this.right, padding.right),
            Math.max(this.bottom, padding.bottom),
            Math.max(this.left, padding.left)
        );
    }

    /**
     * Returns a new padding with the left and right, but with the top and bottom set to 0.
     */
    getHorizontal() {
        return new Padding(0, this.right, 0, this.left);
    }

    /**
     * Returns a new padding with the same top and bottom, but with the left and right set to 0.
     */
    getVertical() {
        return new Padding(this.top, 0, this.bottom, 0);
    }

    get horizontalTotal() {
        return this.left + this.right;
    }

    get verticalTotal() {
        return this.top + this.bottom;
    }

    /**
     *
     * @param {PaddingConfig} config
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
     * @param {Paddings} paddings
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
Object.freeze(zeroPadding);
