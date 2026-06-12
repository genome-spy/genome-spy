import { unzip } from "@gmod/bgzf-filehandle";
import {
    activateExprRefProps,
    isExprRef,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import {
    attachDescriptorFieldsToData,
    loadUrlDescriptorOrSkip,
    normalizeUrlDescriptors,
    watchUrlDescriptorExpressions,
} from "../urlDescriptor.js";
import UrlDescriptorState from "../urlDescriptorState.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

/**
 * @template T
 * @template P
 * @abstract
 */
export default class TabixSource extends SingleAxisWindowedSource {
    /**
     * @typedef {object} TabixHandle
     * @prop {import("@gmod/tabix").TabixIndexedFile} tbiIndex
     * @prop {Record<string, import("../../../spec/channel.js").Scalar>} [fields]
     * @prop {P} parserContext
     * @prop {string} url
     */

    /** @type {UrlDescriptorState<TabixHandle>} */
    #descriptorState = new UrlDescriptorState();

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
                    this.#reloadIfCurrentDomainNeedsData();
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
                    this.#reloadIfCurrentDomainNeedsData();
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

    /**
     * Refreshes active descriptors and reloads the current domain only if the
     * current loaded data does not cover the new active descriptor set.
     */
    async #reloadIfCurrentDomainNeedsData() {
        try {
            await this.#initialize();

            if (
                !this.isDataReadyForDomain({
                    [this.channel]: this.scaleResolution.getDomain(),
                })
            ) {
                this.reloadLastDomain();
            }
        } catch {
            // Initialization has already updated the loading status.
        }
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
            await this.#descriptorState.update(descriptors, (descriptor) =>
                loadUrlDescriptorOrSkip(descriptor, () =>
                    this.#createHandle(
                        descriptor,
                        TabixIndexedFile,
                        RemoteFile,
                        renameRefSeqs
                    )
                )
            );
            this.setLoadingStatus("complete");
        } catch (e) {
            this.load();
            this.setLoadingStatus("error", e.message);
            throw e;
        }
    }

    /**
     * @param {import("../urlDescriptor.js").UrlDescriptor} descriptor
     * @param {typeof import("@gmod/tabix").TabixIndexedFile} TabixIndexedFile
     * @param {typeof import("generic-filehandle2").RemoteFile} RemoteFile
     * @param {((refSeq: string) => string) | undefined} renameRefSeqs
     * @returns {Promise<TabixHandle>}
     */
    async #createHandle(
        descriptor,
        TabixIndexedFile,
        RemoteFile,
        renameRefSeqs
    ) {
        const tbiIndex = new TabixIndexedFile({
            filehandle: new RemoteFile(descriptor.url),
            tbiFilehandle: new RemoteFile(
                descriptor.indexUrl ?? descriptor.url + ".tbi"
            ),
            renameRefSeqs,
        });
        const header = await tbiIndex.getHeader();

        return {
            tbiIndex,
            fields: descriptor.fields,
            parserContext: await this._createParser(header, tbiIndex),
            url: descriptor.url,
        };
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} interval linearized domain
     */
    async loadInterval(interval) {
        await this.initializedPromise;
        const handles = this.#descriptorState.handles;
        const featureChunksByHandle = await this.discretizeAndLoad(
            interval,
            async (discreteInterval, signal) =>
                await Promise.all(
                    handles.map(async (handle) => {
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

                        return /** @type {[TabixHandle, T[]]} */ ([
                            handle,
                            attachDescriptorFieldsToData(
                                this._parseFeatures(
                                    lines,
                                    handle.parserContext
                                ),
                                handle.fields
                            ),
                        ]);
                    })
                )
        );

        if (featureChunksByHandle) {
            this.#publishHandleData(handles, featureChunksByHandle);
        }
    }

    /**
     * @param {string} header
     * @param {import("@gmod/tabix").TabixIndexedFile} tbiIndex
     * @protected
     * @returns {Promise<P>}
     */
    async _createParser(header, tbiIndex) {
        return /** @type {P} */ (undefined);
    }

    /**
     * Read a prefix of the Tabix file and decode it as text.
     *
     * @param {import("@gmod/tabix").TabixIndexedFile} tbiIndex
     * @returns {Promise<string>}
     * @protected
     */
    async _readFilePrefix(tbiIndex) {
        const { maxBlockSize } = await tbiIndex.getMetadata();
        const tabixIndex = /** @type {any} */ (tbiIndex);
        const compressedPrefix = await tabixIndex.filehandle.read(
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
     * @param {P} parserContext
     * @returns {T[]}
     */
    _parseFeatures(lines, parserContext) {
        // Override me
        return [];
    }

    /**
     * @param {TabixHandle[]} handles
     * @param {[TabixHandle, T[]][][]} featureChunksByHandle
     */
    #publishHandleData(handles, featureChunksByHandle) {
        this.reset();

        for (const [handleIndex, handle] of handles.entries()) {
            // Preserve physical file boundaries so downstream transforms can
            // reset schema-dependent state for each partition.
            this.beginBatch({ type: "file", url: handle.url });

            for (const featureChunks of featureChunksByHandle) {
                const [chunkHandle, data] = featureChunks[handleIndex];
                if (chunkHandle !== handle) {
                    throw new Error("Tabix feature chunks are out of order.");
                }

                for (const datum of data) {
                    this._propagate(datum);
                }
            }
        }

        this.complete();
        this.#descriptorState.markLoaded();
    }

    /**
     * @param {import("./singleAxisLazySource.js").DataReadinessRequest} request
     * @returns {boolean}
     */
    isDataReadyForDomain(request) {
        return (
            this.#descriptorState.activeSetLoaded &&
            super.isDataReadyForDomain(request)
        );
    }
}
