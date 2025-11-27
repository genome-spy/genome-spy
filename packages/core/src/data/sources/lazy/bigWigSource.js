import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../view/paramMediator.js";
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

        const activatedParams = activateExprRefProps(
            view.paramMediator,
            paramsWithDefaults,
            (props) => {
                if (props.includes("url")) {
                    this.#initialize().then(() => this.reloadLastDomain());
                } else if (props.includes("pixelsPerBin")) {
                    this.reloadLastDomain();
                }
            }
        );

        super(view, activatedParams.channel);

        this.params = activatedParams;

        if (!this.params.url) {
            throw new Error("No URL provided for BigWigSource");
        }

        this.setupDebouncing(this.params);

        this.#initialize();
    }

    get label() {
        return "bigWigSource";
    }

    #initialize() {
        this.initializedPromise = new Promise((resolve, reject) => {
            Promise.all([
                import("@gmod/bbi"),
                import("generic-filehandle2"),
            ]).then(([{ BigWig }, { RemoteFile }]) => {
                this.#bbi = new BigWig({
                    filehandle: new RemoteFile(
                        addBaseUrl(
                            withoutExprRef(this.params.url),
                            this.view.getBaseUrl()
                        )
                    ),
                });

                this.setLoadingStatus("loading");
                this.#bbi
                    .getHeader()
                    .then((header) => {
                        this.#reductionLevels =
                            /** @type {{reductionLevel: number}[]} */ (
                                header.zoomLevels
                            )
                                .map((z) => z.reductionLevel)
                                .reverse();

                        // Add the non-reduced level. Not sure if this is the best way to do it.
                        // Afaik, the non-reduced bin size is not available in the header.
                        this.#reductionLevels.push(1);

                        this.setLoadingStatus("complete");
                        resolve();
                    })
                    .catch((e) => {
                        // Load empty data
                        this.load();
                        this.setLoadingStatus(
                            "error",
                            `${withoutExprRef(this.params.url)}: ${e.message}`
                        );
                        reject(e);
                    });
            });
        });

        return this.initializedPromise;
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        await this.initializedPromise;

        // TODO: Postpone the initial load until layout is computed and remove 700.
        const length = this.scaleResolution.getAxisLength() || 700;

        const reductionLevel = findReductionLevel(
            domain,
            length,
            this.#reductionLevels
        );

        // The sensible minimum window size actually depends on the non-reduced data density...
        // Using 5000 as a default to avoid too many requests.
        const windowSize = Math.max(reductionLevel * length, 5000);

        this.callIfWindowsChanged(domain, windowSize, (quantizedInterval) =>
            this.loadInterval(quantizedInterval, reductionLevel)
        );
    }

    /**
     * @param {number[]} interval linearized domain
     * @param {number} reductionLevel
     */
    // @ts-expect-error
    async loadInterval(interval, reductionLevel) {
        const scale =
            1 / 2 / reductionLevel / withoutExprRef(this.params.pixelsPerBin);
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
