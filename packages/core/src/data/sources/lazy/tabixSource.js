import { unzip } from "@gmod/bgzf-filehandle";
import {
    activateExprRefProps,
    isExprRef,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import {
    attachDescriptorFieldsToData,
    normalizeUrlDescriptors,
    watchUrlDescriptorExpressions,
} from "../urlDescriptor.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

/**
 * @template T
 * @abstract
 */
export default class TabixSource extends SingleAxisWindowedSource {
    /**
     * @typedef {object} TabixHandle
     * @prop {import("@gmod/tabix").TabixIndexedFile} tbiIndex
     * @prop {Record<string, import("../../../spec/channel.js").Scalar>} [fields]
     * @prop {string} url
     */

    /** @type {TabixHandle[]} */
    #handles = [];

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

        if (
            params.url &&
            typeof params.url == "object" &&
            !isExprRef(params.url)
        ) {
            watchUrlDescriptorExpressions({
                url: params.url,
                indexUrl: params.indexUrl,
                paramRuntime: view.paramRuntime,
                listener: () => {
                    this.#initialize().then(() => this.reloadLastDomain());
                },
                registerDisposer: (disposer) => this.registerDisposer(disposer),
            });
        }

        if (!withoutExprRef(this.params.url)) {
            throw new Error("No URL provided for TabixSource");
        }

        this.setupDebouncing(this.params);

        this.#initialize();
    }

    #initialize() {
        this.initializedPromise = this.#doInitialize();
        return this.initializedPromise;
    }

    async #doInitialize() {
        const descriptors = await normalizeUrlDescriptors({
            url: this.params.url,
            indexUrl: this.params.indexUrl,
            baseUrl: this.view.getBaseUrl(),
            paramRuntime: this.paramRuntime,
        });
        const addChrPrefix = withoutExprRef(this.params.addChrPrefix);

        const [{ TabixIndexedFile }, { RemoteFile }] = await Promise.all([
            import("@gmod/tabix"),
            import("generic-filehandle2"),
        ]);
        const renameRefSeqs =
            addChrPrefix === true
                ? (/** @type {string} */ refSeq) => "chr" + refSeq
                : addChrPrefix
                  ? (/** @type {string} */ refSeq) => addChrPrefix + refSeq
                  : undefined;

        try {
            this.setLoadingStatus("loading");
            const handlesAndHeaders = await Promise.all(
                descriptors.map(async (descriptor) => {
                    const tbiIndex = new TabixIndexedFile({
                        filehandle: new RemoteFile(descriptor.url),
                        tbiFilehandle: new RemoteFile(
                            descriptor.indexUrl ?? descriptor.url + ".tbi"
                        ),
                        renameRefSeqs,
                    });
                    const header = await tbiIndex.getHeader();

                    return {
                        handle: {
                            tbiIndex,
                            fields: descriptor.fields,
                            url: descriptor.url,
                        },
                        header,
                    };
                })
            );

            this.#handles = handlesAndHeaders.map((d) => d.handle);
            await this._handleHeader(handlesAndHeaders[0].header);
            this.setLoadingStatus("complete");
        } catch (e) {
            this.load();
            this.setLoadingStatus("error", e.message);
            throw e;
        }
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
            async (discreteInterval, signal) =>
                (
                    await Promise.all(
                        this.#handles.map(async (handle) => {
                            /** @type {string[]} */
                            const lines = [];

                            await handle.tbiIndex.getLines(
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

                            return attachDescriptorFieldsToData(
                                this._parseFeatures(lines),
                                handle.fields
                            );
                        })
                    )
                ).flat()
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
     * Read a prefix of the Tabix file and decode it as text.
     *
     * @returns {Promise<string>}
     * @protected
     */
    async _readFilePrefix() {
        const firstHandle = this.#handles[0];
        const { maxBlockSize } = await firstHandle.tbiIndex.getMetadata();
        const tbiIndex = /** @type {any} */ (firstHandle.tbiIndex);
        const compressedPrefix = await tbiIndex.filehandle.read(
            maxBlockSize,
            0
        );
        const bytes = await unzip(compressedPrefix);
        return new TextDecoder("utf-8").decode(bytes);
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
