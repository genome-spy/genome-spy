import Transform from "./transform.js";

/**
 * A reservoir sampler, based on: https://www.wikiwand.com/en/Reservoir_sampling
 */
export default class SampleTransform extends Transform {
    /** @type {import("../../types/flowBatch.js").FileBatch | undefined} */
    #fileBatch;

    /** @type {(import("../../types/flowBatch.js").FileBatch | undefined)[]} */
    #reservoirBatches = [];

    /**
     *
     * @param {import("../../spec/transform.js").SampleParams} params
     */
    constructor(params) {
        super(params);

        this.params = params;

        this.k = params.size || 500;
        this.reset();
    }

    reset() {
        super.reset();
        this.#fileBatch = undefined;
        this.#resetSampler();
    }

    #resetSampler() {
        /** @type {any[]} */
        this.reservoir = [];
        this.#reservoirBatches = [];
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
        this.#reservoirBatches.push(this.#fileBatch);

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
            const index = Math.floor(Math.random() * this.k);
            this.reservoir[index] = item;
            this.#reservoirBatches[index] = this.#fileBatch;
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

    /** @param {import("../../types/flowBatch.js").FlowBatch} batch */
    beginBatch(batch) {
        if (batch.type == "file") {
            this.#fileBatch = batch;
        } else {
            this.#flushReservoir();
            this.#resetSampler();
            this.#fileBatch = undefined;
            super.beginBatch(batch);
        }
    }

    complete() {
        this.#flushReservoir();
        super.complete();
    }

    #flushReservoir() {
        /** @type {import("../../types/flowBatch.js").FileBatch | undefined} */
        let previous;
        for (let index = 0; index < this.reservoir.length; index++) {
            const batch = this.#reservoirBatches[index];
            if (batch !== undefined && batch !== previous) {
                super.beginBatch(batch);
                previous = batch;
            }
            this._propagate(this.reservoir[index]);
        }
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
