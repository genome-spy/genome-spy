import SingleAxisLazySource from "./singleAxisLazySource.js";
import windowedMixin from "./windowedMixin.js";
import { debounce } from "../../../utils/debounce.js";
import addBaseUrl from "../../../utils/addBaseUrl.js";

/**
 * @template T
 * @abstract
 */
export default class TabixSource extends windowedMixin(SingleAxisLazySource) {
    #abortController = new AbortController();

    /** @type {import("@gmod/tabix").TabixIndexedFile} */
    tbiIndex;

    /**
     * @param {import("../../../spec/data.js").TabixData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").TabixData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 3_000_000,
            debounceDomainChange: 200,
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for TabixSource");
        }

        if (this.params.debounceDomainChange > 0) {
            this.onDomainChanged = debounce(
                this.onDomainChanged.bind(this),
                this.params.debounceDomainChange,
                false
            );
        }

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("buffer"),
                import("@gmod/tabix"),
                import("generic-filehandle"),
            ]).then(([{ Buffer }, { TabixIndexedFile }, { RemoteFile }]) => {
                // Hack needed by @gmod/tabix
                if (typeof window !== "undefined") {
                    window.Buffer ??= Buffer;
                }

                const withBase = (/** @type {string} */ uri) =>
                    new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

                this.tbiIndex = new TabixIndexedFile({
                    filehandle: withBase(this.params.url),
                    tbiFilehandle: withBase(
                        this.params.indexUrl ?? this.params.url + ".tbi"
                    ),
                });

                resolve();
            });
        });
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        const windowSize = this.params.windowSize;

        if (domain[1] - domain[0] > windowSize) {
            return;
        }

        const quantizedInterval = this.quantizeInterval(domain, windowSize);

        if (this.checkAndUpdateLastInterval(quantizedInterval)) {
            this.doRequest(quantizedInterval);
        }
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} interval linearized domain
     */
    async doRequest(interval) {
        const features = await this.getFeatures(interval);

        if (features) {
            this.publishData(features);
        }
    }

    /**
     *
     * @param {number[]} interval
     */
    async getFeatures(interval) {
        await this.initializedPromise;

        // Doesn't abort the fetch requests. See: https://github.com/GMOD/tabix-js/issues/143
        this.#abortController.abort();

        this.#abortController = new AbortController();
        const signal = this.#abortController.signal;

        const discreteChromosomeIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(interval);

        try {
            const featuresWithChrom = await Promise.all(
                discreteChromosomeIntervals.map(async (d) => {
                    /** @type {string[]} */
                    const lines = [];

                    await this.tbiIndex.getLines(
                        d.chrom,
                        d.startPos,
                        d.endPos,
                        {
                            lineCallback: (line) => {
                                lines.push(line);
                            },
                            signal,
                        }
                    );

                    // Hmm. It's silly that we have to first collect individual lines and then join them.
                    return this._parseFeatures(lines);
                })
            );

            if (!signal.aborted) {
                return featuresWithChrom.flat(); // TODO: Use batches, not flat
            }
        } catch (e) {
            if (!signal.aborted) {
                // TODO: Nice reporting of errors
                throw e;
            }
        }
    }

    /**
     * @abstract
     * @protected
     * @param {string[]} lines
     * @returns {T[]}
     */
    _parseFeatures(lines) {
        return [];
    }
}
