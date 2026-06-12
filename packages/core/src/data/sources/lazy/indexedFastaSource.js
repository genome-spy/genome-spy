import { normalizeSingleUrlDescriptor } from "../urlDescriptor.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

export default class IndexedFastaSource extends SingleAxisWindowedSource {
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

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for IndexedFastaSource");
        }

        this.setupDebouncing(this.params);

        this.#initialize();
    }

    get label() {
        return "bigWigSource";
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
            "IndexedFastaSource"
        );
        const [{ IndexedFasta }, { RemoteFile }] = await Promise.all([
            import("@gmod/indexedfasta"),
            import("generic-filehandle2"),
        ]);

        this.fasta = new IndexedFasta({
            fasta: new RemoteFile(descriptor.url),
            fai: new RemoteFile(descriptor.indexUrl ?? descriptor.url + ".fai"),
        });
    }

    /**
     * @param {number[]} interval linearized domain
     */
    async loadInterval(interval) {
        const features = await this.discretizeAndLoad(
            interval,
            async (d, signal) =>
                this.fasta
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
                    })
        );

        this.publishData([features.filter((f) => f !== undefined)]);
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").IndexedFastaData}
 */
function isIndexedFastaSource(params) {
    return params?.type == "indexedFasta";
}

registerBuiltInLazyDataSource(isIndexedFastaSource, IndexedFastaSource);
