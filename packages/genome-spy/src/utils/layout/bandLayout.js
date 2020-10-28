import Interval from "../interval";
import IntervalCollection from "../intervalCollection";

/**
 * @typedef {Object} Band
 * @prop {string} key
 * @prop {Interval} interval
 */

/**
 * A layout that mimics d3's scaleBand, but with variable widths and other
 * bells and whistles.
 *
 * This class is a messy hack. TODO: Improve
 *
 * TODO: Collapsed bands
 * TODO: Reordering by dragging
 * TODO: Unit test
 *
 * @deprecated
 */
export default class BandLayout {
    constructor() {
        // TODO: paddingOuter

        this._range = [0, 1];

        /** @type {Map<any, number>} Supports collapsing bands */
        this._relativeWidths = new Map();

        /** @type {any[]} domain in a specific order */
        this._domain = [];

        //** @type {Map<string, Interval> | null} for domain to range */
        //this._keyCache = null;

        //** @type {IntervalCollection<Band> | null} for range to domain */
        //this._bands = null;
    }

    _buildCaches() {
        this._keyCache = new Map();

        const bands = [];

        const totalRelativeWidth =
            this._relativeWidths.reduce((a, b) => a + b, 0) || 1;

        const paddedRange = this._range.pad(
            (-this.paddingOuter / 2 / totalRelativeWidth) * this._range.width()
        );

        const rangeWidth = paddedRange.width();

        let x = paddedRange.lower;

        for (let i = 0; i < this._keys.length; i++) {
            const key = this._keys[i];

            const lower = x;
            const upper =
                x + (this._relativeWidths[i] / totalRelativeWidth) * rangeWidth;

            const padding = ((upper - lower) * this.paddingInner) / 2;

            const interval = new Interval(lower + padding, upper - padding);

            bands.push({ key, interval });
            this._keyCache.set(key, interval);

            x = upper;
        }

        this._bands = new IntervalCollection(band => band.interval, bands);
    }

    /**
     * @param {string} key
     */
    scale(key) {
        if (!this._keyCache) {
            this._buildCaches();
        }

        return this._keyCache.get(key);
    }

    /**
     * TODO: findClosest flag, which returns the closest band (if padding was hit)
     *
     * @param {number} value
     * @param {boolean} [closest] Return closest if no exact match was found
     */
    invert(value, closest = false) {
        if (!this._keyCache) {
            this._buildCaches();
        }

        const band = this._bands.intervalAt(value, closest);
        return band && band.key;
    }

    /**
     * TODO: Consider using Interval
     *
     * @param {Interval | number[]} range
     */
    range(range) {
        if (range instanceof Interval) {
            this._range = range;
        } else {
            this._range = Interval.fromArray(range);
        }

        this._keyCache = null;
    }

    getRange() {
        return this._range;
    }

    /**
     * @param {string[]} domain
     * @param {number[]} [widths] relative widths of the bands
     */
    domain(domain, widths) {
        // TODO: Sanity check: throw on duplicates
        this._keys = [...domain];

        // TODO: Preserve existing configs
        this._relativeWidths = widths || Array(domain.length).fill(1);

        this._keyCache = null;
    }

    getDomain() {
        return this._keys;
    }

    /*
     *
     * @param {string[]} keys
     * @param {number} width
     */
    /*
    setWidths(keys, width) {
        for (let key of keys) {
            this._bandConfigs.get(key).width = width;
        }

        this._keyCache = null;
    }
    */

    getBandWidth() {
        return (
            this._range.width() /
            this._relativeWidths.reduce((a, b) => a + b, 0)
        );
    }

    /**
     * @returns {BandLayout}
     */
    clone() {
        const copy = new BandLayout();
        copy.paddingInner = this.paddingInner;
        copy.paddingOuter = this.paddingOuter;
        copy.domain(this._keys, this._relativeWidths);
        copy.range(this._range);

        return copy;
    }
}
