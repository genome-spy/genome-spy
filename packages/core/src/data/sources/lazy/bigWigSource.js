import {
    activateExprRefProps,
    isExprRef,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";
import {
    attachDescriptorFields,
    normalizeUrlDescriptors,
    urlDescriptorKey,
    watchUrlDescriptorExpressions,
} from "../urlDescriptor.js";

/**
 *
 */
export default class BigWigSource extends SingleAxisWindowedSource {
    /**
     * @typedef {object} BigWigHandle
     * @prop {import("@gmod/bbi").BigWig} bbi
     * @prop {number[]} reductionLevels
     * @prop {Record<string, import("../../../spec/channel.js").Scalar>} [fields]
     * @prop {string} url
     */

    /** @type {Map<string, BigWigHandle>} */
    #handleCache = new Map();

    /** @type {BigWigHandle[]} */
    #handles = [];

    /** @type {Set<string>} */
    #descriptorKeys = new Set();

    /** @type {Set<string>} */
    #loadedDescriptorKeys = new Set();

    /**
     * @param {import("../../../spec/data.js").BigWigData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").BigWigData} */
        const paramsWithDefaults = {
            pixelsPerBin: 2,
            channel: "x",
            debounce: 200,
            debounceMode: "window",
            ...params,
        };

        const channel = withoutExprRef(paramsWithDefaults.channel);
        super(view, channel);

        this.params = activateExprRefProps(
            view.paramRuntime,
            paramsWithDefaults,
            (props) => {
                if (props.has("url")) {
                    this.#reloadIfCurrentDomainNeedsData();
                } else if (props.has("pixelsPerBin")) {
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
                paramRuntime: view.paramRuntime,
                listener: () => this.#reloadIfCurrentDomainNeedsData(),
                registerDisposer: (disposer) => this.registerDisposer(disposer),
            });
        }

        if (!this.params.url) {
            throw new Error("No URL provided for BigWigSource");
        }

        this.setupDebouncing(this.params);

        this.#initialize();
    }

    get label() {
        return "bigWigSource";
    }

    /**
     * @returns {Promise<void>}
     */
    #initialize() {
        const initializePromise = this.#doInitialize();
        this.initializedPromise = initializePromise;
        return initializePromise;
    }

    /**
     * Refreshes active descriptors and reloads the current domain only if the
     * current loaded data does not cover the new active descriptor set.
     */
    async #reloadIfCurrentDomainNeedsData() {
        await this.#initialize();

        if (
            !this.isDataReadyForDomain({
                [this.channel]: this.scaleResolution.getDomain(),
            })
        ) {
            this.reloadLastDomain();
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async #doInitialize() {
        const descriptors = await normalizeUrlDescriptors({
            url: this.params.url,
            baseUrl: this.view.getBaseUrl(),
            paramRuntime: this.paramRuntime,
        });
        const descriptorKeys = descriptors.map(urlDescriptorKey);

        const [{ BigWig }, { RemoteFile }] = await Promise.all([
            import("@gmod/bbi"),
            import("generic-filehandle2"),
        ]);

        try {
            this.setLoadingStatus("loading");
            this.#handles = await Promise.all(
                descriptors.map((descriptor, i) =>
                    this.#getOrCreateHandle(
                        descriptor,
                        descriptorKeys[i],
                        BigWig,
                        RemoteFile
                    )
                )
            );
            this.#descriptorKeys = new Set(descriptorKeys);
            this.setLoadingStatus("complete");
        } catch (e) {
            // Load empty data
            this.load();
            this.setLoadingStatus("error", e.message);
            throw e;
        }
    }

    /**
     * @param {import("../urlDescriptor.js").UrlDescriptor} descriptor
     * @param {string} descriptorKey
     * @param {typeof import("@gmod/bbi").BigWig} BigWig
     * @param {typeof import("generic-filehandle2").RemoteFile} RemoteFile
     * @returns {Promise<BigWigHandle>}
     */
    async #getOrCreateHandle(descriptor, descriptorKey, BigWig, RemoteFile) {
        const cachedHandle = this.#handleCache.get(descriptorKey);
        if (cachedHandle) {
            return cachedHandle;
        }

        const bbi = new BigWig({
            filehandle: new RemoteFile(descriptor.url),
        });
        const header = await bbi.getHeader();
        const reductionLevels = /** @type {{reductionLevel: number}[]} */ (
            header.zoomLevels
        )
            .map((z) => z.reductionLevel)
            .reverse();

        // Add the non-reduced level. Not sure if this is the best way to do it.
        // Afaik, the non-reduced bin size is not available in the header.
        reductionLevels.push(1);

        const handle = {
            bbi,
            reductionLevels,
            fields: descriptor.fields,
            url: descriptor.url,
        };
        this.#handleCache.set(descriptorKey, handle);
        return handle;
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        await this.initializedPromise;

        if (!this.#handles.length) {
            this.publishData([]);
            this.#loadedDescriptorKeys = new Set(this.#descriptorKeys);
            return;
        }

        // TODO: Postpone the initial load until layout is computed and remove 700.
        const length = this.scaleResolution.getAxisLength() || 700;

        const reductionLevels = this.#handles.map((handle) =>
            findReductionLevel(domain, length, handle.reductionLevels)
        );

        // The sensible minimum window size actually depends on the non-reduced data density...
        // Using 5000 as a default to avoid too many requests.
        const windowSize = Math.max(
            ...reductionLevels.map((reductionLevel) => reductionLevel * length),
            5000
        );

        this.callIfWindowsChanged(domain, windowSize, (quantizedInterval) =>
            this.loadInterval(quantizedInterval, reductionLevels)
        );
    }

    /**
     * @param {number[]} interval linearized domain
     * @param {number[]} reductionLevels
     */
    // @ts-expect-error
    async loadInterval(interval, reductionLevels) {
        const featureChunks = await this.discretizeAndLoad(interval, {
            load: async (d, signal) => {
                const featuresByHandle = await Promise.all(
                    this.#handles.map((handle, i) => {
                        const scale =
                            1 /
                            2 /
                            reductionLevels[i] /
                            withoutExprRef(this.params.pixelsPerBin);

                        return handle.bbi
                            .getFeatures(d.chrom, d.startPos, d.endPos, {
                                scale,
                                signal,
                            })
                            .then((features) =>
                                mapFeatures(d.chrom, features, handle.fields)
                            );
                    })
                );

                return featuresByHandle.flat();
            },
            loadBatch: (intervals, signal) =>
                Promise.all(
                    this.#handles.map((handle, handleIndex) => {
                        const scale =
                            1 /
                            2 /
                            reductionLevels[handleIndex] /
                            withoutExprRef(this.params.pixelsPerBin);

                        return handle.bbi
                            .getFeaturesMulti(
                                intervals.map((d) => ({
                                    refName: d.chrom,
                                    start: d.startPos,
                                    end: d.endPos,
                                })),
                                { scale, signal }
                            )
                            .then((chunks) =>
                                chunks.map((features, intervalIndex) =>
                                    mapFeatures(
                                        intervals[intervalIndex].chrom,
                                        features,
                                        handle.fields
                                    )
                                )
                            );
                    })
                ).then((chunksByHandle) =>
                    intervals.map((_, intervalIndex) =>
                        chunksByHandle.flatMap(
                            (chunks) => chunks[intervalIndex]
                        )
                    )
                ),
        });

        if (featureChunks) {
            this.publishData(featureChunks);
            this.#loadedDescriptorKeys = new Set(this.#descriptorKeys);
        }
    }

    /**
     * @param {import("./singleAxisLazySource.js").DataReadinessRequest} request
     * @returns {boolean}
     */
    isDataReadyForDomain(request) {
        return (
            this.#descriptorKeys.isSubsetOf(this.#loadedDescriptorKeys) &&
            super.isDataReadyForDomain(request)
        );
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").BigWigData}
 */
function isBigWigSource(params) {
    return params?.type == "bigwig";
}

registerBuiltInLazyDataSource(isBigWigSource, BigWigSource);

/**
 * @param {string} chrom
 * @param {import("@gmod/bbi").Feature[]} features
 * @param {Record<string, import("../../../spec/channel.js").Scalar>} [fields]
 */
function mapFeatures(chrom, features, fields) {
    return features.map((f) =>
        attachDescriptorFields(
            {
                chrom,
                start: f.start,
                end: f.end,
                score: f.score,
            },
            fields
        )
    );
}

/**
 * @param {number[]} domain
 * @param {number} widthInPixels view width in pixels
 * @param {number[]} reductionLevels
 */
function findReductionLevel(domain, widthInPixels, reductionLevels) {
    const bpPerPixel = (domain[1] - domain[0]) / widthInPixels;
    return (
        reductionLevels.find((r) => r < bpPerPixel) ?? reductionLevels.at(-1)
    );
}
