import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { getUrlDescriptorExpressions } from "../urlDescriptor.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import IntervalUrlSource from "./intervalUrlSource.js";

/** @extends {IntervalUrlSource<import("@gmod/indexedfasta").IndexedFasta, import("../../flowNode.js").Datum[][]>} */
export default class IndexedFastaSource extends IntervalUrlSource {
    /**
     * @param {import("../../../spec/data.js").IndexedFastaData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").IndexedFastaData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 7000,
            debounce: 200,
            debounceMode: "window",
            ...params,
        };

        super(view, withoutExprRef(paramsWithDefaults.channel));

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
            throw new Error("No URL provided for IndexedFastaSource");
        }

        this.setupUrlLoading({
            singleUrl: true,
            loadModules: loadFastaModules,
            createHandle: async (descriptor, { IndexedFasta, RemoteFile }) =>
                new IndexedFasta({
                    fasta: new RemoteFile(descriptor.url),
                    fai: new RemoteFile(
                        descriptor.indexUrl ?? descriptor.url + ".fai"
                    ),
                }),
        });
    }

    get label() {
        return "indexedFastaSource";
    }

    /**
     * @param {number[]} interval linearized domain
     * @param {import("@gmod/indexedfasta").IndexedFasta[]} handles
     * @param {AbortSignal} signal
     * @returns {Promise<{interval: number[], data: import("../../flowNode.js").Datum[][]}>}
     */
    async loadWindow(interval, handles, signal) {
        const fasta = handles[0];
        const features = await this.discretizeAndLoad(
            interval,
            async (d, signal) =>
                fasta
                    .getSequence(d.chrom, d.startPos, d.endPos, {
                        signal,
                    })
                    .then((sequence) => {
                        if (sequence != undefined) {
                            return {
                                chrom: d.chrom,
                                start: d.startPos,
                                sequence,
                            };
                        } else {
                            console.log(
                                `No sequence found for interval ${d.chrom}:${d.startPos}-${d.endPos}`
                            );
                            return undefined;
                        }
                    }),
            signal
        );
        return {
            interval,
            data: [features.filter((feature) => feature !== undefined)],
        };
    }
}

async function loadFastaModules() {
    const [{ IndexedFasta }, { RemoteFile }] = await Promise.all([
        import("@gmod/indexedfasta"),
        import("generic-filehandle2"),
    ]);
    return { IndexedFasta, RemoteFile };
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").IndexedFastaData}
 */
function isIndexedFastaSource(params) {
    return params?.type == "indexedFasta";
}

registerBuiltInLazyDataSource(isIndexedFastaSource, IndexedFastaSource);
