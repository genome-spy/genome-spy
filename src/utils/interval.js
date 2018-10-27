/**
 * Closed-Open interval [Lower, Upper)
 * 
 * TODO: Tests
 */
export default class Interval {
    constructor(lower, upper) {
        if (isNaN(lower)) throw `Lower value "${lower}" is not a number!`;
        if (isNaN(upper)) throw `Upper value "${upper}" is not a number!`;
        if (upper < lower) throw `Upper value is less that lower value! Lower ${lower}, upper: ${upper}`;

        this.lower = lower;
        this.upper = upper;
    }

    static fromArray(array) {
        return new Interval(array[0], array[1]);
    }

    contains(value) {
        return this.lower <= value && value < this.upper;
    }

    encloses(range) {
        return this.lower <= range.lower && range.upper <= this.upper;
    }

    width() {
        return this.upper - this.lower;
    }

    // TODO: isConnected, intersection, span, etc

    /**
     * Returns a new Interval that has its lower and upper bounds
     * transformed using the given function.
     * 
     * @param {function} scale A transform function
     */
    transform(scale) {
        return new Interval(scale(this.lower), scale(this.upper));
    }

    copy() {
        return new Interval(this.lower, this.upper);
    }

    withLower(lower) {
        return new Interval(lower, this.upper);
    }

    withUpper(upper) {
        return new Interval(this.lower, upper);
    }

    toString() {
        return `[${this.lower}, ${this.upper})`;
    }
}