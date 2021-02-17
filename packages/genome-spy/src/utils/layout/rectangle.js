/**
 * @param {number} value
 * @returns {ValueAccessor}
 */
function constant(value) {
    return () => value;
}

/**
 * An immutable rectangle with a scene-graph -like hierarchy.
 * Allows for implementing scrolling viewports etc.
 *
 * @typedef {("x" | "y" | "width" | "height")} Prop
 * @typedef {import("./padding").default } Padding
 * @typedef {() => number} ValueAccessor
 */
export default class Rectangle {
    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    static create(x, y, width, height) {
        return new Rectangle(
            constant(x),
            constant(y),
            constant(width),
            constant(height)
        );
    }

    /**
     * @param {Prop} prop
     * @param {number | function():number} value
     */
    _offset(prop, value) {
        switch (typeof value) {
            case "number":
                return () => this[prop] + value;
            case "function":
                return () => this[prop] + value();
            default:
                throw new Error("Not a number of function");
        }
    }

    /**
     * @param {Prop} prop
     */
    _passThrough(prop) {
        return this._offset(prop, 0);
    }

    /**
     *
     * @param {ValueAccessor} x
     * @param {ValueAccessor} y
     * @param {ValueAccessor} width
     * @param {ValueAccessor} height
     */
    constructor(x, y, width, height) {
        /** @readonly */ this._x = x;
        /** @readonly */ this._y = y;
        /** @readonly */ this._width = width;
        /** @readonly */ this._height = height;
    }

    /**
     * @returns {number}
     */
    get x() {
        return this._x();
    }

    /**
     * @returns {number}
     */
    get y() {
        return this._y();
    }

    /**
     * @returns {number}
     */
    get width() {
        return this._width();
    }

    /**
     * @returns {number}
     */
    get height() {
        return this._height();
    }

    get x2() {
        return this.x + this.width;
    }

    get y2() {
        return this.y + this.height;
    }

    /**
     * Returns true if the given rectangle is the same or equal rectangle.
     *
     * @param {Rectangle} rectangle
     */
    equals(rectangle) {
        if (!rectangle) {
            return false;
        }

        return (
            this === rectangle ||
            (this.x === rectangle.x &&
                this.y === rectangle.y &&
                this.width === rectangle.width &&
                this.height === rectangle.height)
        );
    }

    /**
     *
     * @param {Partial<Record<Prop, number | function():number>>} props
     */
    modify(props) {
        if (!Object.keys(props).length) {
            return this;
        }

        /** @param {Prop} prop */
        const map = prop => {
            const v = props[prop];
            return typeof v == "number"
                ? constant(v)
                : typeof v == "function"
                ? v
                : this._passThrough(prop);
        };

        return new Rectangle(map("x"), map("y"), map("width"), map("height"));
    }

    /**
     *
     * @param {number | function():number} x
     * @param {number | function():number} y
     */
    translate(x, y) {
        if (x === 0 && y === 0) {
            return this;
        }

        return new Rectangle(
            this._offset("x", x),
            this._offset("y", y),
            this._passThrough("width"),
            this._passThrough("height")
        );
    }

    /**
     * Returns a copy of this rectangle translated by the given rectangle.
     *
     * @param {Rectangle} rectangle
     */
    translateBy(rectangle) {
        // TODO: Make dynamic
        return this.translate(rectangle.x, rectangle.y);
    }

    /**
     *
     * @param {Padding} padding
     */
    expand(padding, direction = 1) {
        if (
            padding.left == 0 &&
            padding.top == 0 &&
            padding.right == 0 &&
            padding.bottom == 0
        ) {
            return this;
        }

        return new Rectangle(
            padding.left
                ? this._offset("x", -padding.left * direction)
                : this._passThrough("x"),
            padding.top
                ? this._offset("y", -padding.top * direction)
                : this._passThrough("y"),
            padding.width
                ? this._offset("width", padding.width * direction)
                : this._passThrough("width"),
            padding.height
                ? this._offset("height", padding.height * direction)
                : this._passThrough("height")
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

    /**
     * Normalizes a point with respect to this rectangle
     *
     * @param {number} x
     * @param {number} y
     */
    normalizePoint(x, y) {
        return {
            x: (x - this.x) / this.width,
            y: (y - this.y) / this.height
        };
    }
}
