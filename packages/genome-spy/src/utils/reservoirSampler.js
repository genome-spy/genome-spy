/**
 * A reservoir sampler, based on: https://www.wikiwand.com/en/Reservoir_sampling
 */
export default class ReservoirSampler {
    /**
     *
     * @param {number} k sample size
     */
    constructor(k) {
        this.k = k || 1;
        /** @type {any[]} */
        this.reservoir = [];
        /** @type {number} */
        this.W = undefined;
        this.ingester = this.initialIngester;
    }

    getSamples() {
        return this.reservoir;
    }

    /**
     *
     * @param {any} item
     */
    ingest(item) {
        this.ingester(item);
    }

    /**
     *
     * @param {any} item
     */
    initialIngester(item) {
        this.reservoir.push(item);

        if (this.reservoir.length == this.k) {
            this.W = Math.exp(Math.log(Math.random()) / this.k);
            this.i = this.k;
            this.next = this.i;
            this.ingester = this.finalIngester;
            this._setNextStop();
        }
    }

    /**
     *
     * @param {any} item
     */
    finalIngester(item) {
        if (++this.i == this.next) {
            this.reservoir[Math.floor(Math.random() * this.k)] = item;
            this.W = this.W * Math.exp(Math.log(Math.random()) / this.k);
            this._setNextStop();
        }
    }

    _setNextStop() {
        this.next +=
            Math.floor(Math.log(Math.random()) / Math.log(1 - this.W)) + 1;
    }
}
