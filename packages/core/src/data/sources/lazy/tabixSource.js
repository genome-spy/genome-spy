import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { attachDescriptorFieldsToData } from "../urlDescriptor.js";
import UrlDescriptorController from "../urlDescriptorController.js";
import UrlDescriptorState, {
    updateUrlDescriptorState,
} from "../urlDescriptorState.js";
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
     * @prop {Map<string, string>} queryToRawReferenceName
     * @prop {string[]} rawReferenceNames
     * @prop {string} url
     */

    /** @type {UrlDescriptorState<TabixHandle>} */
    #descriptorState = new UrlDescriptorState();

    /** @type {UrlDescriptorController} */
    #urlDescriptors;

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

        this.#urlDescriptors = new UrlDescriptorController(this, {
            getUrl: () => this.params.url,
            getIndexUrl: () => this.params.indexUrl,
            onChange: () => this.#reloadIfCurrentDomainNeedsData(),
        });

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
        await updateUrlDescriptorState({
            controller: this.#urlDescriptors,
            state: this.#descriptorState,
            clearData: () => this.invalidateData(),
            setLoadingStatus: (status, detail) =>
                this.setLoadingStatus(status, detail),
            loadModules: loadTabixModules,
            createHandle: (descriptor, { TabixIndexedFile, RemoteFile }) =>
                this.#createHandle(descriptor, TabixIndexedFile, RemoteFile),
        });

        const addChrPrefix = withoutExprRef(this.params.addChrPrefix);
        for (const handle of this.#descriptorState.handles) {
            try {
                handle.queryToRawReferenceName = createReferenceNameMap(
                    handle.rawReferenceNames,
                    addChrPrefix
                );
            } catch (error) {
                throw new Error(
                    `Cannot map references for Tabix file ${handle.url}: ${/** @type {Error} */ (error).message}`,
                    { cause: error }
                );
            }
        }
    }

    /**
     * @param {import("../urlDescriptor.js").UrlDescriptor} descriptor
     * @param {typeof import("@gmod/tabix").TabixIndexedFile} TabixIndexedFile
     * @param {typeof import("generic-filehandle2").RemoteFile} RemoteFile
     * @returns {Promise<TabixHandle>}
     */
    async #createHandle(descriptor, TabixIndexedFile, RemoteFile) {
        const tbiIndex = new TabixIndexedFile({
            filehandle: new RemoteFile(descriptor.url),
            tbiFilehandle: new RemoteFile(
                descriptor.indexUrl ?? descriptor.url + ".tbi"
            ),
        });
        const [headerLines, rawReferenceNames] = await Promise.all([
            tbiIndex.getHeaderLines(),
            tbiIndex.getReferenceSequenceNames(),
        ]);
        this.registerDisposer(() => tbiIndex.clearChunkCache());

        return {
            tbiIndex,
            fields: descriptor.fields,
            parserContext: await this._createParser(headerLines.join("\n")),
            queryToRawReferenceName: new Map(),
            rawReferenceNames,
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
                        const rawReferenceName =
                            handle.queryToRawReferenceName.get(
                                discreteInterval.chrom
                            );

                        if (!rawReferenceName) {
                            throw new Error(
                                `Reference "${discreteInterval.chrom}" is not available in Tabix file ${handle.url}.`
                            );
                        }

                        await handle.tbiIndex.getLines(
                            rawReferenceName,
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
     * @protected
     * @returns {Promise<P>}
     */
    async _createParser(header) {
        return /** @type {P} */ (undefined);
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

        this.#descriptorState.markLoaded();
        this.complete();
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

async function loadTabixModules() {
    const [{ TabixIndexedFile }, { RemoteFile }] = await Promise.all([
        import("@gmod/tabix"),
        import("generic-filehandle2"),
    ]);
    return { TabixIndexedFile, RemoteFile };
}

/**
 * Builds the mapping from GenomeSpy query names to reference names stored in a
 * Tabix index. Prefixing is idempotent so files using `1` and `chr1` can be
 * queried together, while ambiguous names within one file fail immediately.
 *
 * @param {string[]} rawReferenceNames
 * @param {boolean | string} addChrPrefix
 * @returns {Map<string, string>}
 */
export function createReferenceNameMap(rawReferenceNames, addChrPrefix) {
    const prefix = addChrPrefix === true ? "chr" : addChrPrefix || "";
    const result = new Map();

    for (const rawName of rawReferenceNames) {
        const queryName =
            prefix && !rawName.startsWith(prefix) ? prefix + rawName : rawName;
        const existing = result.get(queryName);

        if (existing) {
            throw new Error(
                `Tabix reference names "${existing}" and "${rawName}" both map to "${queryName}".`
            );
        }

        result.set(queryName, rawName);
    }

    return result;
}
