import * as d3 from "d3";

/**
 * A collection of non-overlapping intervals.
 * Currently implemented as an ordered array. TODO: Use a binary tree
 */
export default class IntervalCollection {
    constructor() {
        this.intervals = [];
    }

    _findInsertionPoint(interval) {
        // TODO: Use binary search
        let i = 0;
        while (i < this.intervals.length && interval.lower >= this.intervals[i].upper) {
                i++;
        }

        if (i < this.intervals.length && this.intervals[i].lower < interval.upper) {
            return -1;

        } else {
            return i;
        }
    }

    /**
     * Adds an interval to the collection
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

    addIfRoom(interval) {
        const i = this._findInsertionPoint(interval);
        if (i < 0) {
            return false;
        }

        this.intervals.splice(i, 0, interval);
        return true;
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

    toArray() {
        return [].concat(this.intervals);
    }

}