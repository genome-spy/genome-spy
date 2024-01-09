import SingleAxisLazySource from "./singleAxisLazySource.js";
import windowedMixin from "./windowedMixin.js";
import { debounce } from "../../../utils/debounce.js";
import addBaseUrl from "../../../utils/addBaseUrl.js";

export default class BigBedSource extends windowedMixin(SingleAxisLazySource) {
    #abortController = new AbortController();

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
        this.#abortController.abort();

        this.#abortController = new AbortController();
        const signal = this.#abortController.signal;

        const discreteChromosomeIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(interval);

        try {
            const featuresWithChrom = await Promise.all(
                discreteChromosomeIntervals.map((d) =>
                    this.bbi
                        .getFeatures(d.chrom, d.startPos, d.endPos, {
                            signal,
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
}
