import addBaseUrl from "../../../utils/addBaseUrl.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

export default class BamSource extends SingleAxisWindowedSource {
    /** @type {import("@gmod/bam").BamFile} */
    #bam;

    /**
     * Some BAM files lack the "chr" prefix on their reference names. For example:
     * http://genome.ucsc.edu/goldenPath/help/examples/bamExample.bam
     *
     * N.B. @SN AN records in SAM header may have alternative names for chromosomes.
     * TODO: Explore their usage
     *
     * @type {(chr: string) => string}
     */
    chrPrefixFixer = (chr) => chr;

    /**
     * @param {import("../../../spec/data.js").BamData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").BamData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 20000,
            debounce: 200,
            debounceMode: "domain",
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for BamSource");
        }

        this.setupDebouncing(this.params);

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/bam"),
                import("generic-filehandle2"),
            ]).then(([{ BamFile }, { RemoteFile }]) => {
                const withBase = (/** @type {string} */ uri) =>
                    new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

                this.#bam = new BamFile({
                    bamFilehandle: withBase(this.params.url),
                    baiFilehandle: withBase(
                        this.params.indexUrl ?? this.params.url + ".bai"
                    ),
                });

                this.#bam.getHeader().then((_header) => {
                    const g = this.genome.hasChrPrefix();
                    const b =
                        this.#bam.indexToChr?.[0]?.refName.startsWith("chr");
                    if (g && !b) {
                        this.chrPrefixFixer = (chr) => chr.replace("chr", "");
                    } else if (!g && b) {
                        this.chrPrefixFixer = (chr) => "chr" + chr;
                    }

                    resolve();
                });
            });
        });
    }

    get label() {
        return "bamSource";
    }

    /**
     * @param {number[]} interval linearized domain
     */
    async loadInterval(interval) {
        const featureChunks = await this.discretizeAndLoad(
            interval,
            async (d, signal) =>
                this.#bam
                    .getRecordsForRange(
                        this.chrPrefixFixer(d.chrom),
                        d.startPos,
                        d.endPos,
                        { signal }
                    )
                    .then((records) =>
                        records.map((record) => ({
                            chrom: d.chrom,
                            start: record.start,
                            end: record.end,
                            name: record.name,
                            //MD: record.get("MD"),
                            cigar: record.CIGAR,
                            mapq: record.mq,
                            strand: record.strand === 1 ? "+" : "-",
                        }))
                    )
        );

        if (featureChunks) {
            this.publishData(featureChunks);
        }
    }
}
