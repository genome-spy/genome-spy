import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { getUrlDescriptorExpressions } from "../urlDescriptor.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import UrlDescriptorWindowedSource from "./urlDescriptorWindowedSource.js";

/** @extends {UrlDescriptorWindowedSource<BamHandle>} */
export default class BamSource extends UrlDescriptorWindowedSource {
    /**
     * @typedef {object} BamHandle
     * @prop {import("@gmod/bam").BamFile} bam
     * @prop {(chr: string) => string} fixChrPrefix
     */

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
                if (props.has("url") || props.has("indexUrl")) {
                    this.reloadUrlDescriptors();
                } else if (props.has("windowSize")) {
                    this.reloadLastDomain();
                }
            },
            (disposer) => this.registerDisposer(disposer),
            getUrlDescriptorExpressions(paramsWithDefaults.url)
        );

        if (!this.params.url) {
            throw new Error("No URL provided for BamSource");
        }

        this.setupDebouncing(this.params);

        this.setupUrlDescriptors(
            {
                getUrl: () => this.params.url,
                getIndexUrl: () => this.params.indexUrl,
                singleSourceName: "BamSource",
            },
            {
                loadModules: loadBamModules,
                createHandle: (descriptor, { BamFile, RemoteFile }) =>
                    this.#createHandle(descriptor, BamFile, RemoteFile),
            }
        );
    }

    get label() {
        return "bamSource";
    }

    /**
     * @param {import("../urlDescriptor.js").UrlDescriptor} descriptor
     * @param {typeof import("@gmod/bam").BamFile} BamFile
     * @param {typeof import("generic-filehandle2").RemoteFile} RemoteFile
     */
    async #createHandle(descriptor, BamFile, RemoteFile) {
        const bam = new BamFile({
            bamFilehandle: new RemoteFile(descriptor.url),
            baiFilehandle: new RemoteFile(
                descriptor.indexUrl ?? descriptor.url + ".bai"
            ),
        });

        await bam.getHeader();
        const g = this.genome.hasChrPrefix();
        const b = bam.indexToChr?.[0]?.refName.startsWith("chr");
        const fixChrPrefix =
            g && !b
                ? (/** @type {string} */ chr) => chr.replace("chr", "")
                : !g && b
                  ? (/** @type {string} */ chr) => "chr" + chr
                  : (/** @type {string} */ chr) => chr;
        return { bam, fixChrPrefix };
    }

    /**
     * @param {number[]} interval linearized domain
     */
    async loadInterval(interval) {
        const handles = await this.getActiveUrlHandles(interval);
        if (!handles) return;
        const handle = handles[0];
        await this.discretizeAndLoad(
            interval,
            async (d, signal) =>
                handle.bam
                    .getRecordsForRange(
                        handle.fixChrPrefix(d.chrom),
                        d.startPos,
                        d.endPos,
                        { signal }
                    )
                    .then((records) =>
                        records.map((record) =>
                            createBamReadDatum(d.chrom, record)
                        )
                    ),
            (chunks) => this.publishData(chunks, interval)
        );
    }
}

async function loadBamModules() {
    const [{ BamFile }, { RemoteFile }] = await Promise.all([
        import("@gmod/bam"),
        import("generic-filehandle2"),
    ]);
    return { BamFile, RemoteFile };
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
