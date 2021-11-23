/**
 * A simple data structure for keeping track of unreserved space in one dimension.
 * Doesn't do any balancing, reservations must be done in random order.
 * Uses arrays to minimize object allocation and burden on GC.
 *
 * Note: this data structure appears to have some similarities to "Segment Tree".
 * TODO: Balancing ideas: https://cp-algorithms.com/data_structures/segment_tree.html
 */
export default class ReservationMap {
    /**
     *
     * @param {number} maxSize Max number of free slots that can be tracked
     * @param {number} [lowerLimit]
     * @param {number} [upperLimit]
     */
    constructor(maxSize, lowerLimit = -Infinity, upperLimit = Infinity) {
        this.maxSize = maxSize;
        this.lowerLimit = lowerLimit;
        this.upperLimit = upperLimit;

        const count = this.maxSize * 2 + 1; // TODO: The factor could be lower

        this.lowerLimits = new Float64Array(count);
        this.upperLimits = new Float64Array(count);
        this.lowerChildren = new Int32Array(count);
        this.upperChildren = new Int32Array(count);

        this.reset();
    }

    reset() {
        this.lowerLimits.fill(0);
        this.upperLimits.fill(0);
        this.lowerChildren.fill(0);
        this.upperChildren.fill(0);

        // Initial node
        this.n = 1;
        this.lowerLimits[0] = this.lowerLimit;
        this.upperLimits[0] = this.upperLimit;
    }

    /**
     *
     * @param {number} lower
     * @param {number} upper
     * @param {number} i
     * @returns {number} Node index or -1 if not found
     */
    _findSlot(lower, upper, i = 0) {
        if (lower >= this.lowerLimits[i] && upper <= this.upperLimits[i]) {
            const lowerChild = this.lowerChildren[i];
            if (!lowerChild) {
                // Node has no children, found a free slot
                return i;
            } else {
                const lowerResult = this._findSlot(lower, upper, lowerChild);
                if (lowerResult >= 0) {
                    return lowerResult;
                }
                return this._findSlot(lower, upper, this.upperChildren[i]);
            }
        } else {
            return -1;
        }
    }

    /**
     *
     * @param {number} lower
     * @param {number} upper
     * @returns {boolean} true if reservation succeeded
     */
    reserve(lower, upper) {
        if (upper - lower <= 0) {
            throw new Error("Cannot reserve an empty or negative-size slot!");
        }

        if (this.n + 1 > this.lowerLimits.length) {
            return false;
        }

        const i = this._findSlot(lower, upper);
        if (i < 0) {
            return false;
        }

        // TODO: if the requested range is connected to an edge of the free slot,
        // adjust the found slot instead

        const lowerIndex = this.n++;
        const upperIndex = this.n++;

        this.lowerLimits[lowerIndex] = this.lowerLimits[i];
        this.upperLimits[lowerIndex] = lower;
        this.lowerLimits[upperIndex] = upper;
        this.upperLimits[upperIndex] = this.upperLimits[i];
        this.lowerChildren[i] = lowerIndex;
        this.upperChildren[i] = upperIndex;

        return true;
    }
}
