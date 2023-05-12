import { Buffer } from "buffer";
import { IndexedFasta } from "@gmod/indexedfasta";
import { RemoteFile } from "generic-filehandle";

import SingleAxisDynamicSource from "./singleAxisDynamicSource";
import { shallowArrayEquals } from "../../../utils/arrayUtils";

// Hack needed by @gmod/indexedfasta
// TODO: Submit a PR to @gmod/indexedfasta to make this unnecessary
// @ts-ignore
window.Buffer = Buffer;

/**
 *
 */
export default class IndexedFastaSource extends SingleAxisDynamicSource {
    /**
     * @type {number[]}
     */
    lastQuantizedInterval = [0, 0];

    /**
     * @param {import("../../../spec/data").IndexedFastaData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data").IndexedFastaData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 7000,
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for IndexedFastaSource");
        }

        this.fasta = new IndexedFasta({
            fasta: new RemoteFile(this.params.url),
            fai: new RemoteFile(
                this.params.indexUrl ?? this.params.url + ".fai"
            ),
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

        // We get three consecutive windows. The idea is to immediately have some data to show
        // to the user when they pan the view.
        const quantizedInterval = [
            Math.max(Math.floor(domain[0] / windowSize - 1) * windowSize, 0),
            Math.min(
                Math.ceil(domain[1] / windowSize + 1) * windowSize,
                this.genome.totalSize
            ),
        ];

        if (shallowArrayEquals(this.lastQuantizedInterval, quantizedInterval)) {
            return;
        }

        this.lastQuantizedInterval = quantizedInterval;

        const discreteChromosomeIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(
                quantizedInterval
            );

        // TODO: Error handling
        const sequencesWithChrom = await Promise.all(
            discreteChromosomeIntervals.map((d) =>
                this.fasta
                    .getSequence(d.chrom, d.startPos, d.endPos)
                    .then((sequence) => ({
                        chrom: d.chrom,
                        start: d.startPos,
                        sequence,
                    }))
            )
        );

        this.publishData(sequencesWithChrom);
    }
}
