import { BigWig } from "@gmod/bbi";
import { RemoteFile } from "generic-filehandle";

import DataSource from "../dataSource";
import { debounce } from "../../../utils/debounce";
import { shallowArrayEquals } from "@genome-spy/core/utils/arrayUtils";

/**
 *
 */
export default class BigWigSource extends DataSource {
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
        super();

        /** @type {import("../../../spec/data").BigWigData} */
        this.params = {
            pixelsPerBin: 2,
            channel: "x",
            ...params,
        };

        this.view = view;

        const channel = this.params.channel;
        if (channel !== "x" && channel !== "y") {
            throw new Error(`Invalid channel: ${channel}. Must be "x" or "y"`);
        }

        this.scaleResolution = this.view.getScaleResolution(channel);
        if (!this.scaleResolution) {
            throw new Error(
                `No scale resolution found for channel "${channel}".`
            );
        }

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
            this.reductionLevels = header.zoomLevels
                .map(
                    (/** @type {{reductionLevel: number}} */ z) =>
                        z.reductionLevel
                )
                .reverse();
            // Add the non-reduced level. Not sure if this is the best way to do it.
            // The non-reduced bin size is not available in the header.
            this.reductionLevels.push(1);
        });

        this.scaleResolution.addEventListener("domain", (event) => {
            this.handleDomainChange(
                event.scaleResolution.getDomain(),
                /** @type {import("../../../spec/genome").ChromosomalLocus[]} */ (
                    event.scaleResolution.getComplexDomain()
                )
            );
        });
    }

    #requestRender() {
        // Awfully hacky way. Rendering should be requested by the collector.
        // TODO: Fix
        this.scaleResolution.members[0].view.context.animator.requestRender();
    }

    get #genome() {
        return this.scaleResolution.getGenome();
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     * @param {import("../../../spec/genome").ChromosomalLocus[]} complexDomain Chrom/Pos domain
     */
    async handleDomainChange(domain, complexDomain) {
        const length = this.#getAxisLength();
        const reductionLevel = findReductionLevel(
            domain,
            length,
            this.reductionLevels
        );

        // The sensible minimum window size actually depends on the non-reduced data density...
        const windowSize = Math.max(reductionLevel * length, 5000);

        const [start, end] = domain;

        // We get three consecutive windows
        const quantizedInterval = [
            Math.max(Math.floor(start / windowSize - 1) * windowSize, 0),
            Math.min(
                Math.ceil(end / windowSize + 1) * windowSize,
                this.#genome.totalSize - 1 // Last base is lost. TODO: Fix
            ),
        ];

        if (shallowArrayEquals(this.lastQuantizedInterval, quantizedInterval)) {
            return;
        }

        this.lastQuantizedInterval = quantizedInterval;

        this.doDebouncedRequest(quantizedInterval, reductionLevel);
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

        this.reset();
        this.beginBatch({ type: "file" });

        for (const d of featureResponse.features) {
            this._propagate(d);
        }

        this.complete();
        this.#requestRender();
    }

    async load() {
        // TODO: Fetch data for the initial domain
        this.reset();
        this.complete();
    }

    /**
     *
     * @param {number[]} interval
     * @param {number} scale
     */
    async getFeatures(interval, scale) {
        let requestId = ++this.lastRequestId;

        // eslint-disable-next-line no-unused-vars
        const header = await this.headerPromise;

        // TODO: Abort previous requests
        const abortController = new AbortController();

        const g = this.#genome;
        const discreteChromosomeIntervals = g.toDiscreteChromosomeIntervals([
            g.toChromosomal(interval[0]),
            g.toChromosomal(interval[1]),
        ]);

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

    /**
     * Returns the length of the axis in pixels. Chooses the smallest of the views.
     * They should all be the same, but some exotic configuration might break that assumption.
     *
     * TODO: Stolen from axisTickSource. Should be moved to a common place.
     */
    #getAxisLength() {
        const lengths = this.scaleResolution.members
            .map(
                (m) =>
                    m.view.coords?.[
                        this.params.channel === "x" ? "width" : "height"
                    ]
            )
            .filter((len) => len > 0);

        return lengths.length
            ? lengths.reduce((a, b) => Math.min(a, b), 10000)
            : 0;
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
