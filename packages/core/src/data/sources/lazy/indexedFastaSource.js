import addBaseUrl from "../../../utils/addBaseUrl.js";
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

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/indexedfasta"),
                import("generic-filehandle2"),
            ]).then(([{ IndexedFasta }, { RemoteFile }]) => {
                const withBase = (/** @type {string} */ uri) =>
                    new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

                this.fasta = new IndexedFasta({
                    fasta: withBase(this.params.url),
                    fai: withBase(
                        this.params.indexUrl ?? this.params.url + ".fai"
                    ),
                });

                resolve();
            });
        });
    }

    get label() {
        return "bigWigSource";
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
