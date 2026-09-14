import { withoutExprRef } from "../../../paramRuntime/paramUtils.js";
import { debounce } from "../../../utils/debounce.js";
import {
    loadUrlDescriptorOrSkip,
    normalizeSingleUrlDescriptor,
    normalizeUrlDescriptors,
    UrlLimitExceededError,
    urlDescriptorKey,
} from "../urlDescriptor.js";
import SingleAxisLazySource from "./singleAxisLazySource.js";

/**
 * @template T
 * @typedef {(discreteInterval: import("../../../genome/genome.js").DiscreteChromosomeInterval, signal: AbortSignal) => Promise<T>} DiscreteIntervalLoader
 */

/**
 * @template T
 * @typedef {object} DiscreteIntervalLoaders
 * @prop {DiscreteIntervalLoader<T>} load
 * @prop {(discreteIntervals: import("../../../genome/genome.js").DiscreteChromosomeInterval[], signal: AbortSignal) => Promise<T[]>} [loadBatch]
 */

/**
 * Windowed lazy source with descriptor-keyed handle reuse and one abort signal
 * covering descriptor resolution, interval loading, and publication.
 *
 * @template H
 * @template D
 * @abstract
 */
export default class UrlDescriptorWindowedSource extends SingleAxisLazySource {
    #abortController = new AbortController();

    /** @type {Map<string, Promise<H>>} */
    #handleCache = new Map();

    /** @type {number[]} */
    #lastQuantizedInterval = [0, 0];

    #lastWindowSize = 0;

    /** @type {number[] | undefined} */
    #lastDomain;

    /** @type {(interval: number[], windowSize?: number) => any} */
    #requestInterval = (interval, windowSize) =>
        this.loadInterval(interval, windowSize);

    /** @type {any} */
    params;

    /** @type {{ getUrl: () => unknown, getIndexUrl?: () => unknown, singleSourceName?: string }} */
    #descriptorOptions;

    /** @type {{ loadModules: () => Promise<any>, createHandle: (descriptor: import("../urlDescriptor.js").UrlDescriptor, modules: any) => Promise<H>, cacheKey?: (descriptor: import("../urlDescriptor.js").UrlDescriptor) => string }} */
    #handleOptions;

    /**
     * @param {import("../../../view/view.js").default} view
     * @param {import("../../../spec/channel.js").PrimaryPositionalChannel} channel
     */
    constructor(view, channel) {
        super(view, channel);
        this.registerDisposer(() => {
            this.#abortController.abort();
            this.#handleCache.clear();
        });
    }

    /**
     * @template M
     * @param {{ getUrl: () => unknown, getIndexUrl?: () => unknown, singleSourceName?: string }} descriptorOptions
     * @param {{
     *     loadModules: () => Promise<M>,
     *     createHandle: (descriptor: import("../urlDescriptor.js").UrlDescriptor, modules: M) => Promise<H>,
     *     cacheKey?: (descriptor: import("../urlDescriptor.js").UrlDescriptor) => string,
     * }} handleOptions
     * @protected
     */
    setupUrlDescriptors(descriptorOptions, handleOptions) {
        this.#descriptorOptions = descriptorOptions;
        this.#handleOptions = handleOptions;
    }

    /**
     * @param {import("../../../spec/data.js").DebouncedData} debounceParams
     * @protected
     */
    setupDebouncing(debounceParams) {
        const wait = () => withoutExprRef(debounceParams.debounce);
        const mode = debounceParams.debounceMode;
        if (mode == "domain") {
            this.onDomainChanged = debounce(
                this.onDomainChanged.bind(this),
                wait,
                false
            );
        } else if (mode == "window") {
            this.#requestInterval = debounce(
                this.#requestInterval,
                wait,
                false
            );
        } else {
            throw new Error("Invalid debounceMode: " + mode);
        }
    }

    /** @protected */
    reloadUrlDescriptors() {
        this.#abortController.abort();
        this.#lastQuantizedInterval = [0, 0];
        this.#lastWindowSize = 0;
        this.invalidateData();
        this.setLoadingStatus("loading");
        this.onDomainChanged(this.scaleResolution.getDomain());
    }

    /** @protected */
    reloadLastDomain() {
        this.#abortController.abort();
        this.#lastQuantizedInterval = [0, 0];
        this.#lastWindowSize = 0;
        this._lastLoadedDomain = undefined;
        this.onDomainChanged(
            this.#lastDomain ?? this.scaleResolution.getDomain()
        );
    }

    /** @param {number[]} domain */
    requestDataForDomain(domain) {
        this.#lastDomain = domain;
        this.reloadLastDomain();
    }

    /** @param {number[]} domain Linearized domain */
    onDomainChanged(domain) {
        this.#lastDomain = domain;
        const windowSize = withoutExprRef(this.params?.windowSize) ?? -1;
        if (domain[1] - domain[0] <= windowSize) {
            const interval = this.getChangedWindow(domain, windowSize);
            if (interval) this.#requestInterval(interval, windowSize);
        }
    }

    /**
     * @param {number[]} domain
     * @protected
     */
    requestWindow(domain) {
        this.#lastDomain = domain;
        this.#requestInterval(domain);
    }

    /**
     * @param {number[]} domain
     * @param {number} [windowSize]
     */
    async loadInterval(domain, windowSize) {
        if (this.disposed) return;

        this.#abortController.abort();
        this.#abortController = new AbortController();
        const signal = this.#abortController.signal;
        this.setLoadingStatus("loading");

        try {
            const handles = await this.#getHandles(signal);
            signal.throwIfAborted();

            if (!handles.length) {
                const empty = /** @type {D} */ ([]);
                this.#publishLoaded(empty, domain, handles, windowSize);
            } else {
                const loaded = await this.loadIntervalData(
                    domain,
                    handles,
                    signal
                );
                signal.throwIfAborted();
                if (loaded) {
                    const size = loaded.windowSize ?? windowSize;
                    this.#publishLoaded(
                        loaded.data,
                        loaded.interval,
                        handles,
                        size
                    );
                }
            }

            if (!signal.aborted) this.setLoadingStatus("complete");
        } catch (e) {
            if (signal.aborted) return;
            this._lastLoadedDomain = undefined;
            this.setLoadingStatus("error", e.message);
        }
    }

    /**
     * @param {number[]} interval
     * @param {H[]} handles
     * @param {AbortSignal} signal
     * @returns {Promise<{interval: number[], data: D, windowSize?: number} | undefined>}
     * @protected
     * @abstract
     */
    async loadIntervalData(interval, handles, signal) {
        return undefined;
    }

    /**
     * @param {D} data
     * @param {number[]} interval
     * @param {H[]} handles
     * @protected
     */
    publishInterval(data, interval, handles) {
        this.publishData(
            /** @type {import("../../flowNode.js").Datum[][]} */ (data),
            interval
        );
    }

    /**
     * @template R
     * @param {number[]} interval
     * @param {DiscreteIntervalLoader<R> | DiscreteIntervalLoaders<R>} loader
     * @param {AbortSignal} signal
     * @returns {Promise<R[]>}
     * @protected
     */
    async discretizeAndLoad(interval, loader, signal) {
        const discreteIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(interval);
        const loaders = typeof loader == "function" ? { load: loader } : loader;
        const result = loaders.loadBatch
            ? await loaders.loadBatch(discreteIntervals, signal)
            : await Promise.all(
                  discreteIntervals.map((d) => loaders.load(d, signal))
              );
        if (result.length !== discreteIntervals.length) {
            throw new Error(
                "Batched lazy loader must return one chunk per interval."
            );
        }
        return result;
    }

    /**
     * @param {number[]} interval
     * @param {number} windowSize
     * @returns {number[] | undefined}
     * @protected
     */
    getChangedWindow(interval, windowSize) {
        const quantized = [
            Math.max(Math.floor(interval[0] / windowSize) * windowSize, 0),
            Math.min(
                Math.ceil(interval[1] / windowSize) * windowSize,
                this.genome.totalSize
            ),
        ];
        const last = this.#lastQuantizedInterval;
        return windowSize !== this.#lastWindowSize ||
            quantized[0] < last[0] ||
            quantized[1] > last[1]
            ? quantized
            : undefined;
    }

    /** @param {AbortSignal} signal */
    async #getHandles(signal) {
        const descriptors = await this.#normalize();
        signal.throwIfAborted();
        if (!descriptors.length) return [];

        const modules = await this.#handleOptions.loadModules();
        signal.throwIfAborted();
        const handles = await Promise.all(
            descriptors.map((descriptor) =>
                loadUrlDescriptorOrSkip(descriptor, () =>
                    this.#getHandle(descriptor, modules)
                )
            )
        );
        return handles.filter((handle) => handle !== undefined);
    }

    /**
     * @param {import("../urlDescriptor.js").UrlDescriptor} descriptor
     * @param {any} modules
     */
    #getHandle(descriptor, modules) {
        const key =
            this.#handleOptions.cacheKey?.(descriptor) ??
            urlDescriptorKey(descriptor);
        let promise = this.#handleCache.get(key);
        if (!promise) {
            promise = this.#handleOptions.createHandle(descriptor, modules);
            this.#handleCache.set(key, promise);
            promise.catch(() => {
                if (this.#handleCache.get(key) === promise) {
                    this.#handleCache.delete(key);
                }
            });
        }
        return promise;
    }

    async #normalize() {
        const options = {
            url: this.#descriptorOptions.getUrl(),
            indexUrl: this.#descriptorOptions.getIndexUrl?.(),
            baseUrl: this.view.getBaseUrl(),
            paramRuntime: this.paramRuntime,
        };
        try {
            return this.#descriptorOptions.singleSourceName
                ? [
                      await normalizeSingleUrlDescriptor(
                          options,
                          this.#descriptorOptions.singleSourceName
                      ),
                  ]
                : await normalizeUrlDescriptors(options);
        } catch (e) {
            if (e instanceof UrlLimitExceededError) return [];
            throw e;
        }
    }

    /**
     * @param {D} data
     * @param {number[]} interval
     * @param {H[]} handles
     * @param {number} [windowSize]
     */
    #publishLoaded(data, interval, handles, windowSize) {
        this._lastLoadedDomain = Array.from(interval);
        this.#lastQuantizedInterval = Array.from(interval);
        if (windowSize !== undefined) this.#lastWindowSize = windowSize;
        try {
            this.publishInterval(data, interval, handles);
        } catch (e) {
            this._lastLoadedDomain = undefined;
            throw e;
        }
    }
}
