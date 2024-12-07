import addBaseUrl from "../../../utils/addBaseUrl.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

/**
 * @template T
 * @abstract
 */
export default class TabixSource extends SingleAxisWindowedSource {
    /** @type {import("@gmod/tabix").TabixIndexedFile} */
    #tbiIndex;

    /**
     * @param {import("../../../spec/data.js").TabixData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").TabixData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 3_000_000,
            debounce: 200,
            debounceMode: "domain",
            addChrPrefix: false,
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for TabixSource");
        }

        this.setupDebouncing(this.params);

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/tabix"),
                import("generic-filehandle"),
            ]).then(async ([{ TabixIndexedFile }, { RemoteFile }]) => {
                const withBase = (/** @type {string} */ uri) =>
                    new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

                this.#tbiIndex = new TabixIndexedFile({
                    filehandle: withBase(this.params.url),
                    tbiFilehandle: withBase(
                        this.params.indexUrl ?? this.params.url + ".tbi"
                    ),
                    renameRefSeqs:
                        this.params.addChrPrefix === true
                            ? (refSeq) => "chr" + refSeq
                            : this.params.addChrPrefix
                              ? (refSeq) => this.params.addChrPrefix + refSeq
                              : undefined,
                });

                const header = await this.#tbiIndex.getHeader();
                await this._handleHeader(header);

                resolve();
            });
        });
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} interval linearized domain
     */
    async loadInterval(interval) {
        await this.initializedPromise;
        const featureChunks = await this.discretizeAndLoad(
            interval,
            async (discreteInterval, signal) => {
                /** @type {string[]} */
                const lines = [];

                await this.#tbiIndex.getLines(
                    discreteInterval.chrom,
                    discreteInterval.startPos,
                    discreteInterval.endPos,
                    {
                        lineCallback: (line) => {
                            lines.push(line);
                        },
                        signal,
                    }
                );

                return this._parseFeatures(lines);
            }
        );

        if (featureChunks) {
            this.publishData(featureChunks);
        }
    }

    /**
     * @param {string} header
     * @protected
     */
    async _handleHeader(header) {
        //
    }

    /**
     * @abstract
     * @protected
     * @param {string[]} lines
     * @returns {T[]}
     */
    _parseFeatures(lines) {
        // Override me
        return [];
    }
}
