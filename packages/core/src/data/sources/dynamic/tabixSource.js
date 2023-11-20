import SingleAxisLazySource from "./singleAxisLazySource.js";
import windowedMixin from "./windowedMixin.js";
import { debounce } from "../../../utils/debounce.js";
import addBaseUrl from "../../../utils/addBaseUrl.js";

/**
 * @template T
 */
export default class TabixSource extends windowedMixin(SingleAxisLazySource) {
    /** Keep track of the order of the requests */
    lastRequestId = 0;

    /** @type {import("@gmod/tabix").TabixIndexedFile} */
    tbiIndex;

    /**
     * @param {import("../../../spec/data").TabixData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data").TabixData} */
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
                import("@gmod/tabix"),
                import("generic-filehandle"),
            ]).then(([{ TabixIndexedFile }, { RemoteFile }]) => {
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
        const featureResponse = await this.getFeatures(interval);

        // Discard late responses
        if (featureResponse.requestId < this.lastRequestId) {
            return;
        }

        this.publishData(featureResponse.features);
    }

    /**
     *
     * @param {number[]} interval
     */
    async getFeatures(interval) {
        await this.initializedPromise;

        let requestId = ++this.lastRequestId;

        // TODO: Abort previous requests
        const abortController = new AbortController();

        const discreteChromosomeIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(interval);

        // TODO: Error handling
        const featuresWithChrom = await Promise.all(
            discreteChromosomeIntervals.map(async (d) => {
                /** @type {string[]} */
                const lines = [];

                await this.tbiIndex.getLines(d.chrom, d.startPos, d.endPos, {
                    lineCallback: (line) => {
                        lines.push(line);
                    },
                    signal: abortController.signal,
                });

                // Hmm. It's silly that we have to first collect individual lines and then join them.
                return this._parseFeatures(lines);
            })
        );

        return {
            requestId,
            abort: () => abortController.abort(),
            features: featuresWithChrom.flat(), // TODO: Use batches, not flat
        };
    }

    /**
     * @abstract
     * @param {string[]} lines
     * @returns {T[]}
     */
    _parseFeatures(lines) {
        return [];
    }
}
