import {
    normalizeSingleUrlDescriptor,
    normalizeUrlDescriptors,
} from "../urlDescriptor.js";
import UrlDescriptorState, {
    updateUrlDescriptorState,
} from "../urlDescriptorState.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

/**
 * Shared replacement lifecycle for descriptor-backed windowed sources.
 * @template T
 * @abstract
 */
export default class UrlDescriptorWindowedSource extends SingleAxisWindowedSource {
    /** @type {UrlDescriptorState<T>} @protected */
    descriptorState = new UrlDescriptorState();

    /** @type {{ getUrl: () => unknown, getIndexUrl?: () => unknown, singleSourceName?: string }} */
    #descriptorOptions;

    /**
     * @param {import("../../../view/view.js").default} view
     * @param {import("../../../spec/channel.js").PrimaryPositionalChannel} channel
     */
    constructor(view, channel) {
        super(view, channel);
        this.registerDisposer(() => this.descriptorState.dispose());
    }

    /**
     * @param {{ getUrl: () => unknown, getIndexUrl?: () => unknown, singleSourceName?: string }} options
     * @param {(revision: number) => Promise<void>} initialize
     * @protected
     */
    setupUrlDescriptors(options, initialize) {
        this.#descriptorOptions = options;
        this.#initialize(initialize);
    }

    /**
     * @template M
     * @param {number} revision
     * @param {{
     *     loadModules: () => Promise<M>,
     *     createHandle: (descriptor: import("../urlDescriptor.js").UrlDescriptor, modules: M) => Promise<T>
     * }} options
     * @protected
     */
    updateUrlDescriptors(revision, options) {
        return updateUrlDescriptorState({
            ...options,
            normalize: () => this.#normalize(),
            state: this.descriptorState,
            clearData: () => this.invalidateData(),
            setLoadingStatus: (status, detail) =>
                this.setLoadingStatus(status, detail),
            revision,
        });
    }

    /**
     * @param {(revision: number) => Promise<void>} initialize
     * @protected
     */
    async reloadUrlDescriptors(initialize) {
        const revision = this.#initialize(initialize);
        try {
            await this.initializedPromise;
            if (
                this.descriptorState.isCurrent(revision) &&
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
     * Waits for descriptor initialization and returns the active handle set.
     * Completes and publishes an empty batch when no handles are active.
     *
     * @param {number[]} domain
     * @returns {Promise<T[] | undefined>}
     * @protected
     */
    async getActiveUrlHandles(domain) {
        await this.initializedPromise;
        const handles = this.descriptorState.activeHandles;
        if (!handles) return;
        if (handles.length) return handles;
        this.descriptorState.markLoaded();
        this.publishData([], domain);
    }

    /** @param {(revision: number) => Promise<void>} initialize */
    #initialize(initialize) {
        this.abortPendingLoad();
        const revision = this.descriptorState.beginUpdate();
        this.initializedPromise = initialize(revision);
        return revision;
    }

    async #normalize() {
        const options = {
            url: this.#descriptorOptions.getUrl(),
            indexUrl: this.#descriptorOptions.getIndexUrl?.(),
            baseUrl: this.view.getBaseUrl(),
            paramRuntime: this.paramRuntime,
        };
        return this.#descriptorOptions.singleSourceName
            ? [
                  await normalizeSingleUrlDescriptor(
                      options,
                      this.#descriptorOptions.singleSourceName
                  ),
              ]
            : normalizeUrlDescriptors(options);
    }

    /** @param {import("./singleAxisLazySource.js").DataReadinessRequest} request */
    isDataReadyForDomain(request) {
        return (
            this.descriptorState.activeSetLoaded &&
            super.isDataReadyForDomain(request)
        );
    }
}
