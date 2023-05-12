import { BigWig } from "@gmod/bbi";
import { RemoteFile } from "generic-filehandle";

import { debounce } from "../../../utils/debounce";
import { shallowArrayEquals } from "../../../utils/arrayUtils";
import SingleAxisDynamicSource from "./singleAxisDynamicSource";

/**
 *
 */
export default class BigWigSource extends SingleAxisDynamicSource {
    /**
     * @type {number[]}
     */
    lastQuantizedInterval = [0, 0];

    /** @type {number[]} */
    reductionLevels = [];

    /** Keep track of the order of the requests */
    lastRequestId = 0;

    /**
     * @param {import("../../../spec/data").BigWigData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data").BigWigData} */
        const paramsWithDefaults = {
            pixelsPerBin: 2,
            channel: "x",
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for IndexedFastaSource");
        }

        this.bbi = new BigWig({
            filehandle: new RemoteFile(this.params.url),
        });

        this.doDebouncedRequest = debounce(
            this.doRequest.bind(this),
            200,
            false
        );

        this.headerPromise = this.bbi.getHeader();

        this.headerPromise.then((header) => {
            this.reductionLevels = /** @type {{reductionLevel: number}[]} */ (
                header.zoomLevels
            )
                .map((z) => z.reductionLevel)
                .reverse();

            // Add the non-reduced level. Not sure if this is the best way to do it.
            // Afaik, the non-reduced bin size is not available in the header.
            this.reductionLevels.push(1);
        });
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        const length = this.getAxisLength();

        // Header must be available to determine the reduction level
        await this.headerPromise;

        const reductionLevel = findReductionLevel(
            domain,
            length,
            this.reductionLevels
        );

        // The sensible minimum window size actually depends on the non-reduced data density...
        // Using 5000 as a default to avoid too many requests.
        const windowSize = Math.max(reductionLevel * length, 5000);

        // We get three consecutive windows. The idea is to immediately have some data to show
        // to the user when they pan the view.
        const quantizedInterval = [
            Math.max(Math.floor(domain[0] / windowSize - 1) * windowSize, 0),
            Math.min(
                Math.ceil(domain[1] / windowSize + 1) * windowSize,
                this.genome.totalSize
            ),
        ];

        if (
            !shallowArrayEquals(this.lastQuantizedInterval, quantizedInterval)
        ) {
            this.lastQuantizedInterval = quantizedInterval;
            this.doDebouncedRequest(quantizedInterval, reductionLevel);
        }
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} interval linearized domain
     * @param {number} reductionLevel
     */
    async doRequest(interval, reductionLevel) {
        const featureResponse = await this.getFeatures(
            interval,
            1 / 2 / reductionLevel / this.params.pixelsPerBin
        );

        // Discard late responses
        if (featureResponse.requestId < this.lastRequestId) {
            return;
        }

        this.publishData(featureResponse.features);
    }

    /**
     *
     * @param {number[]} interval
     * @param {number} scale
     */
    async getFeatures(interval, scale) {
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
                        scale,
                        signal: abortController.signal,
                    })
                    .then((features) =>
                        features.map((f) => ({
                            chrom: d.chrom,
                            start: f.start,
                            end: f.end,
                            score: f.score,
                        }))
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

/**
 * @param {number[]} domain
 * @param {number} widthInPixels view width in pixels
 * @param {number[]} reductionLevels
 */
function findReductionLevel(domain, widthInPixels, reductionLevels) {
    const bpPerPixel = (domain[1] - domain[0]) / widthInPixels;
    return (
        reductionLevels.find((r) => r < bpPerPixel) ?? reductionLevels.at(-1)
    );
}
