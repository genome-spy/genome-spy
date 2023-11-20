import SingleAxisLazySource from "./singleAxisLazySource.js";
import windowedMixin from "./windowedMixin.js";
import { debounce } from "../../../utils/debounce.js";
import addBaseUrl from "../../../utils/addBaseUrl.js";

export default class BigBedSource extends windowedMixin(SingleAxisLazySource) {
    /** Keep track of the order of the requests */
    lastRequestId = 0;

    /** @type {import("@gmod/bed").default} */
    parser;

    /** @type {import("@gmod/bbi").BigBed} */
    bbi;

    /**
     * @param {import("../../../spec/data.js").BigBedData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").BigBedData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 1000000,
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for BigBedSource");
        }

        this.doDebouncedRequest = debounce(
            this.doRequest.bind(this),
            200,
            false
        );

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/bed"),
                import("@gmod/bbi"),
                import("generic-filehandle"),
            ]).then(([bed, { BigBed }, { RemoteFile }]) => {
                const BED = bed.default;

                this.bbi = new BigBed({
                    filehandle: new RemoteFile(
                        addBaseUrl(this.params.url, this.view.getBaseUrl())
                    ),
                });

                this.headerPromise = this.bbi.getHeader();
                this.headerPromise.then(async (header) => {
                    // @ts-ignore TODO: Fix
                    this.parser = new BED({ autoSql: header.autoSql });

                    resolve();
                });
            });
        });
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        await this.initializedPromise;

        const windowSize = this.params.windowSize;

        if (domain[1] - domain[0] > windowSize) {
            return;
        }

        const quantizedInterval = this.quantizeInterval(domain, windowSize);

        if (this.checkAndUpdateLastInterval(quantizedInterval)) {
            this.doDebouncedRequest(quantizedInterval);
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
        let requestId = ++this.lastRequestId;

        // TODO: Abort previous requests
        const abortController = new AbortController();

        const discreteChromosomeIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(interval);

        // TODO: Error handling
        const featuresWithChrom = await Promise.all(
            discreteChromosomeIntervals.map((d) =>
                this.bbi
                    .getFeatures(d.chrom, d.startPos, d.endPos, {
                        signal: abortController.signal,
                    })
                    .then((features) =>
                        features.map((f) =>
                            this.parser.parseLine(
                                `${d.chrom}\t${f.start}\t${f.end}\t${f.rest}`,
                                { uniqueId: f.uniqueId }
                            )
                        )
                    )
            )
        );

        return {
            requestId,
            abort: () => abortController.abort(),
            features: featuresWithChrom.flat(), // TODO: Use batches, not flat
        };
    }
}
