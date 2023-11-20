import { debounce } from "../../../utils/debounce.js";
import SingleAxisLazySource from "./singleAxisLazySource.js";
import windowedMixin from "./windowedMixin.js";
import addBaseUrl from "../../../utils/addBaseUrl.js";

/**
 *
 */
export default class BigWigSource extends windowedMixin(SingleAxisLazySource) {
    /** @type {number[]} */
    reductionLevels = [];

    /** Keep track of the order of the requests */
    lastRequestId = 0;

    /** @type {import("@gmod/bbi").BigWig} */
    bbi;

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
            throw new Error("No URL provided for BigWigSource");
        }

        this.doDebouncedRequest = debounce(
            this.doRequest.bind(this),
            200,
            false
        );

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/bbi"),
                import("generic-filehandle"),
            ]).then(([{ BigWig }, { RemoteFile }]) => {
                this.bbi = new BigWig({
                    filehandle: new RemoteFile(
                        addBaseUrl(this.params.url, this.view.getBaseUrl())
                    ),
                });

                this.bbi.getHeader().then((header) => {
                    this.reductionLevels =
                        /** @type {{reductionLevel: number}[]} */ (
                            header.zoomLevels
                        )
                            .map((z) => z.reductionLevel)
                            .reverse();

                    // Add the non-reduced level. Not sure if this is the best way to do it.
                    // Afaik, the non-reduced bin size is not available in the header.
                    this.reductionLevels.push(1);

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

        // TODO: Postpone the initial load until layout is computed and remove 700.
        const length = this.getAxisLength() || 700;

        const reductionLevel = findReductionLevel(
            domain,
            length,
            this.reductionLevels
        );

        // The sensible minimum window size actually depends on the non-reduced data density...
        // Using 5000 as a default to avoid too many requests.
        const windowSize = Math.max(reductionLevel * length, 5000);

        const quantizedInterval = this.quantizeInterval(domain, windowSize);

        if (this.checkAndUpdateLastInterval(quantizedInterval)) {
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
