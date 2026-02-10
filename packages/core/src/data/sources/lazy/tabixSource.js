import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
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

        const channel = withoutExprRef(paramsWithDefaults.channel);
        super(view, channel);

        this.params = activateExprRefProps(
            view.paramRuntime,
            paramsWithDefaults,
            (props) => {
                if (
                    props.has("url") ||
                    props.has("indexUrl") ||
                    props.has("addChrPrefix")
                ) {
                    this.#initialize().then(() => this.reloadLastDomain());
                } else if (props.has("windowSize")) {
                    this.reloadLastDomain();
                }
            },
            (disposer) => this.registerDisposer(disposer),
            { batchMode: "whenPropagated" }
        );

        if (!withoutExprRef(this.params.url)) {
            throw new Error("No URL provided for TabixSource");
        }

        this.setupDebouncing(this.params);

        this.#initialize();
    }

    #initialize() {
        this.initializedPromise = new Promise((resolve, reject) => {
            Promise.all([
                import("@gmod/tabix"),
                import("generic-filehandle2"),
            ]).then(async ([{ TabixIndexedFile }, { RemoteFile }]) => {
                const withBase = (/** @type {string} */ uri) =>
                    new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

                const url = withoutExprRef(this.params.url);
                const indexUrl =
                    withoutExprRef(this.params.indexUrl) ?? url + ".tbi";
                const addChrPrefix = withoutExprRef(this.params.addChrPrefix);

                this.#tbiIndex = new TabixIndexedFile({
                    filehandle: withBase(url),
                    tbiFilehandle: withBase(indexUrl),
                    renameRefSeqs:
                        addChrPrefix === true
                            ? (refSeq) => "chr" + refSeq
                            : addChrPrefix
                              ? (refSeq) => addChrPrefix + refSeq
                              : undefined,
                });

                try {
                    this.setLoadingStatus("loading");
                    const header = await this.#tbiIndex.getHeader();
                    await this._handleHeader(header);
                    this.setLoadingStatus("complete");
                    resolve();
                } catch (e) {
                    this.load();
                    this.setLoadingStatus(
                        "error",
                        `${withoutExprRef(this.params.url)}: ${e.message}`
                    );
                    reject(e);
                }
            });
        });

        return this.initializedPromise;
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
