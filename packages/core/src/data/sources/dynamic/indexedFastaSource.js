import { Buffer } from "buffer";
import { IndexedFasta } from "@gmod/indexedfasta";
import { RemoteFile } from "generic-filehandle";

import SingleAxisDynamicSource from "./singleAxisDynamicSource";
import windowedMixin from "./windowedMixin";
import addBaseUrl from "@genome-spy/core/utils/addBaseUrl";

// Hack needed by @gmod/indexedfasta
// TODO: Submit a PR to @gmod/indexedfasta to make this unnecessary
// @ts-ignore
window.Buffer = Buffer;

/**
 *
 */
export default class IndexedFastaSource extends windowedMixin(
    SingleAxisDynamicSource
) {
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

        const withBase = (/** @type {string} */ uri) =>
            new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

        this.fasta = new IndexedFasta({
            fasta: withBase(this.params.url),
            fai: withBase(this.params.indexUrl ?? this.params.url + ".fai"),
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
}
