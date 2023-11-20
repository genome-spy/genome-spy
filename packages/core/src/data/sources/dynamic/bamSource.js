import SingleAxisLazySource from "./singleAxisLazySource.js";
import windowedMixin from "./windowedMixin.js";
import addBaseUrl from "../../../utils/addBaseUrl.js";

export default class BamSource extends windowedMixin(SingleAxisLazySource) {
    /** Keep track of the order of the requests */
    lastRequestId = 0;

    /** @type {import("@gmod/bam").BamFile} */
    bam;

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
     * @param {import("../../../spec/data").BamData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data").BamData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 20000,
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for BamSource");
        }

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/bam"),
                import("generic-filehandle"),
            ]).then(([{ BamFile }, { RemoteFile }]) => {
                const withBase = (/** @type {string} */ uri) =>
                    new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

                this.bam = new BamFile({
                    bamFilehandle: withBase(this.params.url),
                    baiFilehandle: withBase(
                        this.params.indexUrl ?? this.params.url + ".bai"
                    ),
                });

                this.bam.getHeader().then((_header) => {
                    const g = this.genome.hasChrPrefix();
                    const b =
                        // @ts-expect-error protected property
                        this.bam.indexToChr?.[0]?.refName.startsWith("chr");
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

        await this.initializedPromise;

        const quantizedInterval = this.quantizeInterval(domain, windowSize);

        if (this.checkAndUpdateLastInterval(quantizedInterval)) {
            const discreteChromosomeIntervals =
                this.genome.continuousToDiscreteChromosomeIntervals(
                    quantizedInterval
                );

            // TODO: Error handling
            const sequencesWithChrom = await Promise.all(
                discreteChromosomeIntervals.map((d) =>
                    this.bam
                        .getRecordsForRange(
                            this.chrPrefixFixer(d.chrom),
                            d.startPos,
                            d.endPos
                        )
                        .then((records) =>
                            records.map((record) => ({
                                chrom: d.chrom,
                                start: record.get("start"),
                                end: record.get("end"),
                                name: record.get("name"),
                                MD: record.get("MD"),
                                cigar: record.get("cigar"),
                                mapq: record.get("mq"),
                                strand: record.get("strand") === 1 ? "+" : "-",
                            }))
                        )
                )
            );

            this.publishData(sequencesWithChrom.flat());
        }
    }
}
