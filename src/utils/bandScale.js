import Interval from "./interval";

/**
 * A scale that mimics d3's scaleBand.
 * 
 * TODO: Collapsed bands
 * TODO: Reordering by dragging
 */
export default class BandScale {
    constructor() {
        this._range = [0, 1];
        this.indexes = new Map();
        this.paddingInner = 0;
        this.paddingOuter = 0;

        /** @type {number} */
        this.step = null;

        /** @type {number} */
        this.bandwidth = null;
    }

    _rescale() {
        let [start, stop] = this._range;

        this.step = (stop - start) / (this.n - this.paddingInner + 2 * this.paddingOuter);
        this.bandwidth = this.step * (1 - this.paddingInner);
    }

    /**
     * @param {string} key
     */
    scale(key) {
        const i = this._indexes.get(key);
        if (typeof i == "number") {
            const x = this.paddingInner * this.bandwidth + i * this.step;

            return new Interval(x, x + this.bandwidth);

        } else {
            return null;
        }
    }

    /**
     * @param {number} value 
     */
    invert(value) {
        value -= this.paddingOuter * this.step;
        const index = Math.floor(value / this.step);

        return index >= 0 && index < this.n && value % this.step < this.bandwidth ?
            this._keys[index] :
            null
    }

    /**
     * @param {number[]} range 
     */
    range(range) {
        this._range = range;
        this._rescale();
    }

    /**
     * @param {string[]} domain
     */
    domain(domain) {
        this._indexes = new Map();
        this._keys = [];
        let i = 0;
        for (let key of domain) {
            if (!this._indexes.has(key)) {
                this._indexes.set(key, i++);
                this._keys.push(key);
            }
        }

        this._rescale();
    }

    get n() {
        return this._indexes.size;
    }

    clone() {
        const copy = new BandScale();
        copy.paddingInner = this.paddingInner;
        copy.paddingOuter = this.paddingOuter;
        copy.domain(this._keys);
        copy.range(this._range)

        return copy;
    }
}