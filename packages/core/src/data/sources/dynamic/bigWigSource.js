import addBaseUrl from "../../../utils/addBaseUrl.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

/**
 *
 */
export default class BigWigSource extends SingleAxisWindowedSource {
    /** @type {number[]} */
    #reductionLevels = [];

    /** @type {import("@gmod/bbi").BigWig} */
    #bbi;

    /**
     * @param {import("../../../spec/data.js").BigWigData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").BigWigData} */
        const paramsWithDefaults = {
            pixelsPerBin: 2,
            channel: "x",
            debounce: 200,
            debounceMode: "window",
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for BigWigSource");
        }

        this.setupDebouncing(this.params);

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/bbi"),
                import("generic-filehandle"),
            ]).then(([{ BigWig }, { RemoteFile }]) => {
                this.#bbi = new BigWig({
                    filehandle: new RemoteFile(
                        addBaseUrl(this.params.url, this.view.getBaseUrl())
                    ),
                });

                this.#bbi.getHeader().then((header) => {
                    this.#reductionLevels =
                        /** @type {{reductionLevel: number}[]} */ (
                            header.zoomLevels
                        )
                            .map((z) => z.reductionLevel)
                            .reverse();

                    // Add the non-reduced level. Not sure if this is the best way to do it.
                    // Afaik, the non-reduced bin size is not available in the header.
                    this.#reductionLevels.push(1);

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
            this.#reductionLevels
        );

        // The sensible minimum window size actually depends on the non-reduced data density...
        // Using 5000 as a default to avoid too many requests.
        const windowSize = Math.max(reductionLevel * length, 5000);

        const quantizedInterval = this.quantizeInterval(domain, windowSize);

        if (this.checkAndUpdateLastInterval(quantizedInterval)) {
            this.loadInterval(quantizedInterval, reductionLevel);
        }
    }

    /**
     * @param {number[]} interval linearized domain
     * @param {number} reductionLevel
     */
    // @ts-expect-error
    async loadInterval(interval, reductionLevel) {
        const scale = 1 / 2 / reductionLevel / this.params.pixelsPerBin;
        const featureChunks = await this.discretizeAndLoad(
            interval,
            (d, signal) =>
                this.#bbi
                    .getFeatures(d.chrom, d.startPos, d.endPos, {
                        scale,
                        signal,
                    })
                    .then((features) =>
                        features.map((f) => ({
                            chrom: d.chrom,
                            start: f.start,
                            end: f.end,
                            score: f.score,
                        }))
                    )
        );

        if (featureChunks) {
            this.publishData(featureChunks);
        }
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
