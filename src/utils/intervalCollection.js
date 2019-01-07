import * as d3 from "d3";

/**
 * A collection of non-overlapping intervals.
 * Currently implemented as an ordered array.
 * TODO: Use a binary tree
 */
export default class IntervalCollection {
    /**
     * @param {Function} accessor An optional function that extracts the interval from an object
     */
    constructor(accessor) {
        this.intervals = [];

        if (accessor) {
            this.accessor = accessor;
        } else {
            this.accessor = i => i;
        }
    }

    /**
     * @param {Interval} interval
     */
    _findInsertionPoint(interval) {

        interval = this.accessor(interval);

        // TODO: Use binary search
        let i = 0;
        while (i < this.intervals.length && interval.lower >= this.accessor(this.intervals[i]).upper) {
                i++;
        }

        if (i < this.intervals.length && this.accessor(this.intervals[i]).lower < interval.upper) {
            return -1;

        } else {
            return i;
        }
    }

    /**
     * Adds an interval to the collection. Throws an exception if there was no room.
     * 
     * @param {Interval} interval
     */
    add(interval) {
        const i = this._findInsertionPoint(interval);
        if (i < 0) {
            throw "No room for the given interval!";
        }

        this.intervals.splice(i, 0, interval);
    }

    /**
     * Adds an interval if there is room for it. Returns true on success.
     * 
     * @param {Interval} interval 
     */
    addIfRoom(interval) {
        const i = this._findInsertionPoint(interval);
        if (i < 0) {
            return false;
        }

        this.intervals.splice(i, 0, interval);
        return true;
    }

    /**
     * Returns the interval or object that encloses the given number.
     * TODO: Consider returning an array (to be compatible with IntervalTree)
     * 
     * @param {number} value the value to find
     * @returns a matching interval or object. Null if nothing was found.
     */
    intervalAt(value) {
        if (this.intervals.length == 0) {
            return null;
        }

        // TODO: Use binary search
        let i = 0;
        while (i < this.intervals.length && value >= this.accessor(this.intervals[i]).upper) {
            i++;
        }

        if (i < this.intervals.length && this.accessor(this.intervals[i]).contains(value)) {
            return this.intervals[i];

        } else {
            return null;
        }
    }

    /**
     * Returns true if one or more intervals in the collection overlaps
     * with the given interval.
     * 
     * @param {Interval} interval 
     */
    overlaps(interval) {
        return this._findInsertionPoint(interval) < 0;
    }

    clear() {
        this.intervals = [];
    }

    toArray() {
        return [].concat(this.intervals);
    }

}