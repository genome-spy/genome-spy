import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { normalizeSingleUrlDescriptor } from "../urlDescriptor.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
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

        const channel = withoutExprRef(paramsWithDefaults.channel);
        super(view, channel);

        this.params = activateExprRefProps(
            view.paramRuntime,
            paramsWithDefaults,
            (props) => {
                if (props.has("windowSize")) {
                    this.reloadLastDomain();
                }
            },
            (disposer) => this.registerDisposer(disposer),
            { batchMode: "whenPropagated" }
        );

        if (!this.params.url) {
            throw new Error("No URL provided for BamSource");
        }

        this.setupDebouncing(this.params);

        this.#initialize();
    }

    get label() {
        return "bamSource";
    }

    #initialize() {
        this.initializedPromise = this.#doInitialize();
        return this.initializedPromise;
    }

    async #doInitialize() {
        const descriptor = await normalizeSingleUrlDescriptor(
            {
                url: this.params.url,
                indexUrl: this.params.indexUrl,
                baseUrl: this.view.getBaseUrl(),
                paramRuntime: this.paramRuntime,
            },
            "BamSource"
        );
        const [{ BamFile }, { RemoteFile }] = await Promise.all([
            import("@gmod/bam"),
            import("generic-filehandle2"),
        ]);

        this.#bam = new BamFile({
            bamFilehandle: new RemoteFile(descriptor.url),
            baiFilehandle: new RemoteFile(
                descriptor.indexUrl ?? descriptor.url + ".bai"
            ),
        });

        await this.#bam.getHeader();
        const g = this.genome.hasChrPrefix();
        const b = this.#bam.indexToChr?.[0]?.refName.startsWith("chr");
        if (g && !b) {
            this.chrPrefixFixer = (chr) => chr.replace("chr", "");
        } else if (!g && b) {
            this.chrPrefixFixer = (chr) => "chr" + chr;
        }
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
                        records.map((record) =>
                            createBamReadDatum(d.chrom, record)
                        )
                    )
        );

        if (featureChunks) {
            this.publishData(featureChunks);
        }
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").BamData}
 */
function isBamSource(params) {
    return params?.type == "bam";
}

registerBuiltInLazyDataSource(isBamSource, BamSource);

/**
 * @param {string} chrom
 * @param {import("@gmod/bam").BamRecord} record
 */
export function createBamReadDatum(chrom, record) {
    return {
        chrom,
        start: record.start,
        end: record.end,
        name: record.name,
        cigar: record.CIGAR || "*",
        mapq: record.mq,
        strand: record.strand === 1 ? "+" : "-",
        seq: record.seq,
        qual: record.qual ? Array.from(record.qual) : undefined,
        md: record.getTag("MD"),
        flags: record.flags,
        isPaired: record.isPaired(),
        isProperPair: record.isProperlyPaired(),
        isDuplicate: record.isDuplicate(),
        isQcFail: record.isFailedQc(),
        isSecondary: record.isSecondary(),
        isSupplementary: record.isSupplementary(),
    };
}
