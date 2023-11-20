import FlowNode from "../flowNode.js";

/**
 * A reservoir sampler, based on: https://www.wikiwand.com/en/Reservoir_sampling
 */
export default class SampleTransform extends FlowNode {
    /**
     *
     * @param {import("../../spec/transform.js").SampleParams} params
     */
    constructor(params) {
        super();

        this.k = params.size || 500;
        this.reset();
    }

    reset() {
        super.reset();

        /** @type {any[]} */
        this.reservoir = [];
        /** @type {number} */
        this.W = undefined;
        this.ingester = this._initialIngester;
    }

    /**
     *
     * @param {any} item
     */
    _initialIngester(item) {
        this.reservoir.push(item);

        if (this.reservoir.length == this.k) {
            this.W = Math.exp(Math.log(Math.random()) / this.k);
            this.i = this.k;
            this.next = this.i;
            this.ingester = this._finalIngester;
            this._setNextStop();
        }
    }

    /**
     *
     * @param {any} item
     */
    _finalIngester(item) {
        if (++this.i == this.next) {
            this.reservoir[Math.floor(Math.random() * this.k)] = item;
            this.W *= Math.exp(Math.log(Math.random()) / this.k);
            this._setNextStop();
        }
    }

    _setNextStop() {
        this.next +=
            Math.floor(Math.log(Math.random()) / Math.log(1 - this.W)) + 1;
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.ingester(datum);
    }

    complete() {
        for (const datum of this.reservoir) {
            this._propagate(datum);
        }

        super.complete();
    }
}

/**
 * A convenience function that uses SampleTransform to sample an iterable.
 *
 * @param {number} n
 * @param {Iterable<T>} iterable
 * @param {function(T):R} accessor
 * @returns {R[]}
 * @template T
 * @template R
 */
export function sampleIterable(n, iterable, accessor) {
    const sampler = new SampleTransform({
        type: "sample",
        size: n,
    });
    for (const d of iterable) {
        sampler.handle(accessor(d));
    }
    sampler.complete();

    return sampler.reservoir;
}
