import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";
import { createDescriptorFieldAttacher } from "../urlDescriptor.js";
import UrlDescriptorController from "../urlDescriptorController.js";
import UrlDescriptorState, {
    updateUrlDescriptorState,
} from "../urlDescriptorState.js";

/**
 *
 */
export default class BigWigSource extends SingleAxisWindowedSource {
    /**
     * @typedef {object} BigWigHandle
     * @prop {import("@gmod/bbi").BigWig} bbi
     * @prop {(datum: Record<string, any>) => Record<string, any>} attachFields
     * @prop {number[]} reductionLevels
     * @prop {string} url
     */

    /** @type {UrlDescriptorState<BigWigHandle>} */
    #descriptorState = new UrlDescriptorState();

    /** @type {UrlDescriptorController} */
    #urlDescriptors;

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

        this.#urlDescriptors = new UrlDescriptorController(this, {
            getUrl: () => this.params.url,
            onChange: () => this.#reloadIfCurrentDomainNeedsData(),
        });

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

    /**
     * @returns {Promise<void>}
     */
    async #doInitialize() {
        await updateUrlDescriptorState({
            controller: this.#urlDescriptors,
            state: this.#descriptorState,
            clearData: () => this.load(),
            setLoadingStatus: (status, detail) =>
                this.setLoadingStatus(status, detail),
            loadModules: loadBigWigModules,
            createHandle: (descriptor, { BigWig, RemoteFile }) =>
                this.#createHandle(descriptor, BigWig, RemoteFile),
        });
    }

    /**
     * @param {import("../urlDescriptor.js").UrlDescriptor} descriptor
     * @param {typeof import("@gmod/bbi").BigWig} BigWig
     * @param {typeof import("generic-filehandle2").RemoteFile} RemoteFile
     * @returns {Promise<BigWigHandle>}
     */
    async #createHandle(descriptor, BigWig, RemoteFile) {
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
            attachFields: createDescriptorFieldAttacher(descriptor.fields),
            reductionLevels,
            url: descriptor.url,
        };
        return handle;
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        await this.initializedPromise;

        const handles = this.#descriptorState.handles;
        if (!handles.length) {
            this.publishData([]);
            this.#descriptorState.markLoaded();
            return;
        }

        // TODO: Postpone the initial load until layout is computed and remove 700.
        const length = this.scaleResolution.getAxisLength() || 700;

        const selectedReductionLevels = handles.map((handle) =>
            findReductionLevel(domain, length, handle.reductionLevels)
        );

        // The sensible minimum window size actually depends on the non-reduced data density...
        // Using 5000 as a default to avoid too many requests.
        const windowSize = Math.max(
            ...selectedReductionLevels.map(
                (reductionLevel) => reductionLevel * length
            ),
            5000
        );

        this.callIfWindowsChanged(domain, windowSize, (quantizedInterval) =>
            this.loadInterval(quantizedInterval, selectedReductionLevels)
        );
    }

    /**
     * @param {number[]} interval linearized domain
     * @param {number[]} selectedReductionLevels
     */
    // @ts-expect-error
    async loadInterval(interval, selectedReductionLevels) {
        const handles = this.#descriptorState.handles;
        const featureChunks = await this.discretizeAndLoad(interval, {
            load: (d, signal) =>
                this.#loadFeatures(d, handles, selectedReductionLevels, signal),
            loadBatch: (intervals, signal) =>
                this.#loadFeatureBatches(
                    intervals,
                    handles,
                    selectedReductionLevels,
                    signal
                ),
        });

        if (featureChunks) {
            this.publishData(featureChunks);
            this.#descriptorState.markLoaded();
        }
    }

    /**
     * @param {import("@genome-spy/core/genome/genome.js").DiscreteChromosomeInterval} interval
     * @param {BigWigHandle[]} handles
     * @param {number[]} selectedReductionLevels
     * @param {AbortSignal} signal
     */
    async #loadFeatures(interval, handles, selectedReductionLevels, signal) {
        const featuresByHandle = await Promise.all(
            handles.map((handle, i) => {
                const scale = bigWigScale(
                    selectedReductionLevels[i],
                    withoutExprRef(this.params.pixelsPerBin)
                );

                return handle.bbi
                    .getFeatures(
                        interval.chrom,
                        interval.startPos,
                        interval.endPos,
                        {
                            scale,
                            signal,
                        }
                    )
                    .then((features) =>
                        mapFeatures(
                            interval.chrom,
                            features,
                            handle.attachFields
                        )
                    );
            })
        );

        return featuresByHandle.flat();
    }

    /**
     * @param {import("@genome-spy/core/genome/genome.js").DiscreteChromosomeInterval[]} intervals
     * @param {BigWigHandle[]} handles
     * @param {number[]} selectedReductionLevels
     * @param {AbortSignal} signal
     */
    async #loadFeatureBatches(
        intervals,
        handles,
        selectedReductionLevels,
        signal
    ) {
        const chunksByHandle = await Promise.all(
            handles.map((handle, handleIndex) => {
                const scale = bigWigScale(
                    selectedReductionLevels[handleIndex],
                    withoutExprRef(this.params.pixelsPerBin)
                );

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
                                handle.attachFields
                            )
                        )
                    );
            })
        );

        return intervals.map((_, intervalIndex) =>
            chunksByHandle.flatMap((chunks) => chunks[intervalIndex])
        );
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

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").BigWigData}
 */
function isBigWigSource(params) {
    return params?.type == "bigwig";
}

registerBuiltInLazyDataSource(isBigWigSource, BigWigSource);

async function loadBigWigModules() {
    const [{ BigWig }, { RemoteFile }] = await Promise.all([
        import("@gmod/bbi"),
        import("generic-filehandle2"),
    ]);
    return { BigWig, RemoteFile };
}

/**
 * @param {string} chrom
 * @param {import("@gmod/bbi").Feature[]} features
 * @param {(datum: Record<string, any>) => Record<string, any>} attachFields
 */
function mapFeatures(chrom, features, attachFields) {
    return features.map((f) =>
        attachFields({
            chrom,
            start: f.start,
            end: f.end,
            score: f.score,
        })
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

/**
 * @param {number} reductionLevel
 * @param {number} pixelsPerBin
 */
function bigWigScale(reductionLevel, pixelsPerBin) {
    return 1 / 2 / reductionLevel / pixelsPerBin;
}
