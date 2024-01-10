import SingleAxisLazySource from "./singleAxisLazySource.js";
import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { debounce } from "@genome-spy/core/utils/debounce.js";

/**
 * @abstract
 */
export default class SingleAxisWindowedSource extends SingleAxisLazySource {
    #abortController = new AbortController();

    /**
     * @type {number[]}
     */
    #lastQuantizedInterval = [0, 0];

    /**
     * @type {{windowSize?: number}}
     * @protected
     */
    params;

    /**
     * @param {import("../../../spec/data.js").DebouncedData} debounceParams
     * @protected
     */
    setupDebouncing(debounceParams) {
        if (debounceParams.debounce > 0) {
            if (debounceParams.debounceMode == "domain") {
                this.onDomainChanged = debounce(
                    this.onDomainChanged.bind(this),
                    debounceParams.debounce,
                    false
                );
            } else if (debounceParams.debounceMode == "window") {
                this.loadInterval = debounce(
                    this.loadInterval.bind(this),
                    debounceParams.debounce,
                    false
                );
            }
        }
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        const windowSize = this.params?.windowSize ?? -1;

        if (domain[1] - domain[0] > windowSize) {
            return;
        }

        const quantizedInterval = this.quantizeInterval(domain, windowSize);

        if (this.checkAndUpdateLastInterval(quantizedInterval)) {
            // Possible metadata must be loaded before the first request.
            await this.initializedPromise;

            this.loadInterval(quantizedInterval);
        }
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} interval linearized domain
     * @protected
     */
    async loadInterval(interval) {
        // Override me if needed
    }

    /**
     * Splits the interval into discrete chromosomal intervals – one for each chromosome –
     * and loads the data for each of them. Handles abort signals and errors.
     *
     * @param {number[]} interval
     * @param {(discreteInteval: import("@genome-spy/core/genome/genome.js").DiscreteChromosomeInterval, signal: AbortSignal) => Promise<T>} loader
     * @return {Promise<T[]>}
     * @template T
     * @protected
     */
    async discretizeAndLoad(interval, loader) {
        // Abort previous requests
        this.#abortController.abort();

        this.#abortController = new AbortController();
        const signal = this.#abortController.signal;

        // GMOD libraries expect a single chromosome/sequence for each request.
        // Thus, we split the interval into discrete intervals representing
        // individual chromosomes and load the data for each of them separately
        // but in parallel.
        const discreteChromosomeIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(interval);

        try {
            const resultByChrom = await Promise.all(
                discreteChromosomeIntervals.map(async (d) => loader(d, signal))
            );

            if (!signal.aborted) {
                return resultByChrom;
            }
        } catch (e) {
            if (!signal.aborted) {
                // TODO: Nice reporting of errors
                throw e;
            }
        }
    }

    /**
     * Returns three consecutive windows. The idea is to immediately have some data
     * to show to the user when they pan the view. The windows are conceptually
     * similar to "tiles" but they are never loaded separately.
     *
     * @param {number[]} interval
     * @param {number} windowSize
     * @protected
     */
    quantizeInterval(interval, windowSize) {
        return [
            Math.max(Math.floor(interval[0] / windowSize - 1) * windowSize, 0),
            Math.min(
                Math.ceil(interval[1] / windowSize + 1) * windowSize,
                this.genome.totalSize // Perhaps scale domain should be used here
            ),
        ];
    }

    /**
     *
     * @param {number[]} interval
     * @protected
     */
    checkAndUpdateLastInterval(interval) {
        if (shallowArrayEquals(this.#lastQuantizedInterval, interval)) {
            return false;
        }

        this.#lastQuantizedInterval = interval;
        return true;
    }
}
