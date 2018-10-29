/**
 * Closed-Open interval [Lower, Upper)
 * 
 * TODO: Tests, tests, tests, tests, tests, tests, tests
 * TODO: Should enforce immutability
 */
export default class Interval {
    constructor(lower, upper) {
        if (isNaN(lower)) throw `Lower value "${lower}" is not a number!`;
        if (isNaN(upper)) throw `Upper value "${upper}" is not a number!`;
        if (upper < lower) throw `Upper value is less that lower value! Lower: ${lower}, upper: ${upper}`;

        this.lower = lower;
        this.upper = upper;
    }

    static fromArray(array) {
        return new Interval(array[0], array[1]);
    }

    contains(value) {
        return this.lower <= value && value < this.upper;
    }

    encloses(otherInterval) {
        return this.lower <= otherInterval.lower && otherInterval.upper <= this.upper;
    }

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

    // TODO: isConnected, intersection, span, etc

    connectedWith(otherInterval) {
        return this.upper > otherInterval.lower && otherInterval.upper > this.lower;
    }
    
    intersect(otherInterval) {
        if (!this.connectedWith(otherInterval)) {
            return null; // TODO: Or maybe an "empty" Interval object
        }

        return new Interval(
            Math.max(this.lower, otherInterval.lower),
            Math.min(this.upper, otherInterval.upper)
        );
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

        // TODO: What to do with effectively empty intervals (lower = upper)
        return new Interval(
            Math.min(this.lower, otherInterval.lower),
            Math.max(this.upper, otherInterval.upper)
        );
    }

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