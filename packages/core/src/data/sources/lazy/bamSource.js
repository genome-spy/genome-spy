import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { getUrlDescriptorExpressions } from "../urlDescriptor.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import IntervalUrlSource from "./intervalUrlSource.js";

/** @extends {IntervalUrlSource<BamHandle, import("../../flowNode.js").Datum[][]>} */
export default class BamSource extends IntervalUrlSource {
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

        /** @type {[string, string][]} */
        this.tagFields = createTagFields(paramsWithDefaults.tags);

        if (!this.params.url) {
            throw new Error("No URL provided for BamSource");
        }

        this.setupUrlLoading({
            singleUrl: true,
            loadModules: loadBamModules,
            createHandle: (descriptor, { BamFile, RemoteFile }) =>
                this.#createHandle(descriptor, BamFile, RemoteFile),
        });
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
     * @param {BamHandle[]} handles
     * @param {AbortSignal} signal
     * @returns {Promise<{interval: number[], data: import("../../flowNode.js").Datum[][]}>}
     */
    async loadWindow(interval, handles, signal) {
        const handle = handles[0];
        return {
            interval,
            data: await this.discretizeAndLoad(
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
                                createBamReadDatum(
                                    d.chrom,
                                    record,
                                    this.tagFields
                                )
                            )
                        ),
                signal
            ),
        };
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
 * Validates the requested SAM tags and pairs each with its datum field name.
 *
 * @param {string[]} [tags]
 * @returns {[string, string][]} `[fieldName, tag]` pairs
 */
export function createTagFields(tags) {
    if (!tags) {
        return [];
    }
    if (!Array.isArray(tags)) {
        throw new Error("BAM tags must be an array of SAM tag names");
    }
    // Each tag occurs at most once per record, so a repeated name adds nothing
    return [...new Set(tags)].map((tag) => {
        if (!/^[A-Za-z][A-Za-z0-9]$/.test(tag)) {
            throw new Error(
                `Invalid SAM tag name "${tag}". Tags have two characters, e.g. "HP".`
            );
        }
        return ["tag_" + tag, tag];
    });
}

/**
 * @param {string} chrom
 * @param {import("@gmod/bam").BamRecord} record
 * @param {[string, string][]} [tagFields] `[fieldName, tag]` pairs from
 *   `createTagFields`, copied onto the datum
 */
export function createBamReadDatum(chrom, record, tagFields) {
    /** @type {import("../../flowNode.js").Datum} */
    const datum = {
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

    if (tagFields) {
        // Always set the field, even when the tag is missing, so that every
        // row has the same shape.
        for (const [field, tag] of tagFields) {
            datum[field] = record.getTag(tag);
        }
    }

    return datum;
}
