/**
 * Closed-Open interval [Lower, Upper)
 * 
 * TODO: Should enforce immutability
 */
export default class Interval {
    /**
     * @param {number} lower 
     * @param {number} upper 
     */
    constructor(lower, upper) {
        if (isNaN(lower)) {
            throw `Lower value "${lower}" is not a number!`;
        }
        if (isNaN(upper)) {
            throw `Upper value "${upper}" is not a number!`;
        }
        if (upper < lower) {
            throw `Upper value is less that lower value! Lower: ${lower}, upper: ${upper}`;
        }

        this.lower = lower;
        this.upper = upper;
    }

    /**
     * @param {number[]} array 
     */
    static fromArray(array) {
        return new Interval(array[0], array[1]);
    }

    /**
     * @param {Interval} otherInterval 
     */
    equals(otherInterval) {
        return otherInterval instanceof Interval &&
            this.lower == otherInterval.lower && this.upper == otherInterval.upper;
    }

    /**
     * @param {number} value 
     */
    contains(value) {
        return this.lower <= value && value < this.upper;
    }

    /**
     * @param {Interval} otherInterval 
     */
    encloses(otherInterval) {
        return this.lower <= otherInterval.lower && otherInterval.upper <= this.upper;
    }

    // TODO: Empty intervals should be unambigious. Now empty may be "null" or lower = upper
    empty() {
        return this.lower == this.upper;
    }

    // TODO: Rename to "size". Would apply to both width and height
    width() {
        return this.upper - this.lower;
    }

    centre() {
        return (this.lower + this.upper) / 2;
    }

    /**
     * @param {Interval} otherInterval 
     */
    connectedWith(otherInterval) {
        return this.upper >= otherInterval.lower && otherInterval.upper >= this.lower;
    }

    /**
     * @param {Interval} otherInterval 
     */
    intersect(otherInterval) {
        if (!this.connectedWith(otherInterval)) {
            // TODO: Or maybe return an "empty" Interval null-object
            return null;
        }

        const intersection = new Interval(
            Math.max(this.lower, otherInterval.lower),
            Math.min(this.upper, otherInterval.upper)
        );

        return intersection.width() > 0 ? intersection : null;
    }

    /**
     * Returns an Interval that encloses both this and the other Interval
     * 
     * @param {Interval} otherInterval The other interval
     */
    span(otherInterval) {
        // Handle empty interval
        if (otherInterval == null) {
            return this.copy();
        }

        return new Interval(
            Math.min(this.lower, otherInterval.lower),
            Math.max(this.upper, otherInterval.upper)
        );
    }

    /**
     * Returns a new Interval that has its lower and upper bounds
     * transformed using the given function.
     * 
     * @param {function | null} scale A transform function or null
     */
    transform(scale) {
        if (scale) {
            return new Interval(scale(this.lower), scale(this.upper));
        } else {
            return this;
        }
    }

    /**
     * Returns an Interval that is a blend of this and the given interval.
     * 
     * This is mainly intended for animated transitions between two intervals.
     * 
     * @param {Interval} otherInterval The interval to blend with
     * @param {number} ratio The ratio of blending, [0, 1]. 0 = all this, 1 = all that
     */
    mix(otherInterval, ratio) {
        const m = (a, b) => a * (1 - ratio) + b * ratio;
        return new Interval(
            m(this.lower, otherInterval.lower),
            m(this.upper, otherInterval.upper)
        );
    }

    /**
     * Returns a new Interval with lower and upper padding of the given length
     * 
     * @param {number} length 
     */
    pad(length) {
        return new Interval(this.lower - length, this.upper + length);
    }

    copy() {
        return new Interval(this.lower, this.upper);
    }

    /**
     * @param {number} lower 
     */
    withLower(lower) {
        return new Interval(lower, this.upper);
    }

    /**
     * @param {number} upper 
     */
    withUpper(upper) {
        return new Interval(this.lower, upper);
    }

    toString() {
        return `[${this.lower}, ${this.upper})`;
    }

    toArray() {
        return [this.lower, this.upper];
    }
}