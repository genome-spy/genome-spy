/**
 * @typedef { import("./interval").default } Interval
 */

/**
 * A collection of non-overlapping intervals.
 * Currently implemented as an ordered array.
 * TODO: Use a binary tree
 * 
 * @class
 * @template T
 */
export default class IntervalCollection {
    /**
     * @param {function(object):Interval} [accessor] An optional function that extracts the interval from an object
     * @param {T[]} [array] An optional ORDERED array to wrap as an Interval collection
     */
    constructor(accessor, array) {
        this.intervals = array || [];
        /** @type {function(object):Interval} */
        this.accessor = accessor || (i => i);
    }

    /**
     * @param {T} object
     */
    _findInsertionPoint(object) {

        const interval = this.accessor(object);

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
     * @param {T} object
     */
    add(object) {
        const i = this._findInsertionPoint(object);
        if (i < 0) {
            throw "No room for the given interval!";
        }

        this.intervals.splice(i, 0, object);
    }

    /**
     * Adds an interval if there is room for it. Returns true on success.
     * 
     * @param {T} object 
     */
    addIfRoom(object) {
        const i = this._findInsertionPoint(object);
        if (i < 0) {
            return false;
        }

        this.intervals.splice(i, 0, object);
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
     * @param {T} object 
     */
    overlaps(object) {
        return this._findInsertionPoint(object) < 0;
    }

    clear() {
        this.intervals = [];
    }

    toArray() {
        return [].concat(this.intervals);
    }

}