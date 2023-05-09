import { Buffer } from "buffer";
import { IndexedFasta } from "@gmod/indexedfasta";
import { RemoteFile } from "generic-filehandle";

import DataSource from "../dataSource";

// Hack needed by @gmod/indexedfasta
// TODO: Submit a PR to @gmod/indexedfasta to make this unnecessary
// @ts-ignore
window.Buffer = Buffer;

const windowSize = 7000;

/**
 *
 */
export default class IndexedFastaSource extends DataSource {
    /**
     * @type {import("../../../spec/genome").ChromosomalLocus[]}
     */
    #lastQuantizedDomain;

    /**
     * @param {import("../../../spec/data").IndexedFastaData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        super();

        this.params = params;
        this.view = view;

        this.channel = this.params.channel ?? "x";
        if (this.channel !== "x" && this.channel !== "y") {
            throw new Error(
                `Invalid channel: ${this.channel}. Must be "x" or "y"`
            );
        }

        this.scaleResolution = this.view.getScaleResolution(this.channel);
        if (!this.scaleResolution) {
            throw new Error(
                `No scale resolution found for channel "${this.channel}".`
            );
        }

        if (!this.params.url) {
            throw new Error("No URL provided for IndexedFastaSource");
        }

        this.fasta = new IndexedFasta({
            fasta: new RemoteFile(this.params.url),
            fai: new RemoteFile(
                this.params.indexUrl ?? this.params.url + ".fai"
            ),
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

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     * @param {import("../../../spec/genome").ChromosomalLocus[]} complexDomain Chrom/Pos domain
     */
    async handleDomainChange(domain, complexDomain) {
        // Note: window size must be smaller than the largest chromosome.
        // In other words, the domain can comprise the maximum of 2 chromosomes.
        if (domain[1] - domain[0] > windowSize) {
            return;
        }

        const uniqueChroms = [...new Set(complexDomain.map((d) => d.chrom))];
        const firstChrom = uniqueChroms.at(0);
        const lastChrom = uniqueChroms.at(-1);

        const [start, end] = complexDomain;

        // We get three consecutive windows
        const startPos = Math.floor(start.pos / windowSize - 1) * windowSize;
        const endPos = Math.ceil(end.pos / windowSize + 1) * windowSize;

        const quantizedDomain = [
            { chrom: firstChrom, pos: startPos },
            { chrom: lastChrom, pos: endPos },
        ];

        if (isIdenticalDomain(this.#lastQuantizedDomain, quantizedDomain)) {
            return;
        }

        this.#lastQuantizedDomain = quantizedDomain;

        // Handle two cases: 1) Domain is within one chromosome, 2) Domain spans two chromosomes
        const sequences =
            uniqueChroms.length == 1
                ? [this.getSequence(firstChrom, Math.max(0, startPos), endPos)]
                : [
                      this.getSequence(
                          firstChrom,
                          Math.max(0, startPos),
                          startPos + 3 * windowSize
                      ),
                      this.getSequence(
                          lastChrom,
                          Math.max(0, endPos - 3 * windowSize),
                          endPos
                      ),
                  ];

        // TODO: Propagate asynchronously. Needs some locking mechanism.
        const resolvedSequences = await Promise.all(sequences);

        this.reset();
        this.beginBatch({ type: "file" });

        for (const d of resolvedSequences) {
            this._propagate(d);
        }

        this.complete();
        this.#requestRender();
    }

    async load() {
        // TODO: Why is this needed? No dynamic data is shown without this.
        this.reset();
        this.complete();
    }

    /**
     *
     * @param {string} seqName
     * @param {number} start
     * @param {number} end
     */
    async getSequence(seqName, start, end) {
        const sequence = await this.fasta.getSequence(seqName, start, end);
        return {
            chrom: seqName,
            start,
            sequence,
        };
    }
}

/**
 * @param {import("@genome-spy/core/spec/genome").ChromosomalLocus[]} domain1
 * @param {import("@genome-spy/core/spec/genome").ChromosomalLocus[]} domain2
 */
function isIdenticalDomain(domain1, domain2) {
    return (
        domain1 &&
        domain2 &&
        domain1.length == domain2.length &&
        domain1.every(
            (d, i) => d.chrom == domain2[i].chrom && d.pos == domain2[i].pos
        )
    );
}
