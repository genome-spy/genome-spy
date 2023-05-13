import { BigBed } from "@gmod/bbi";
import { RemoteFile } from "generic-filehandle";
import BED from "@gmod/bed";

import SingleAxisDynamicSource from "./singleAxisDynamicSource";
import windowedMixin from "./windowedMixin";
import { debounce } from "../../../utils/debounce";

export default class BigBedSource extends windowedMixin(
    SingleAxisDynamicSource
) {
    /** Keep track of the order of the requests */
    lastRequestId = 0;

    /** @type {BED} */
    parser;

    /**
     * @param {import("../../../spec/data").BigBedData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data").BigBedData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 1000000,
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for IndexedFastaSource");
        }

        this.bbi = new BigBed({
            filehandle: new RemoteFile(this.params.url),
        });

        this.doDebouncedRequest = debounce(
            this.doRequest.bind(this),
            200,
            false
        );

        this.headerPromise = this.bbi.getHeader();

        this.headerPromise.then((header) => {
            this.parser = new BED({ autoSql: header.autoSql });
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
