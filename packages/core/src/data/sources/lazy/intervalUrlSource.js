import { withoutExprRef } from "../../../paramRuntime/paramUtils.js";
import { debounce } from "../../../utils/debounce.js";
import {
    loadUrlDescriptorOrSkip,
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
export default class IntervalUrlSource extends SingleAxisLazySource {
    #abortController = new AbortController();

    /** @type {Map<string, Promise<H>>} */
    #handleCache = new Map();

    /** @type {number[]} */
    #lastQuantizedInterval = [0, 0];

    #lastWindowSize = 0;

    /** @type {number[] | undefined} */
    #lastDomain;

    /** @type {(interval: number[], windowSize?: number) => any} */
    #debouncedRequest = (interval, windowSize) =>
        this.requestInterval(interval, windowSize);

    /** @type {any} */
    params;

    /** @type {{ loadModules: () => Promise<any>, createHandle: (descriptor: import("../urlDescriptor.js").UrlDescriptor, modules: any) => Promise<H>, cacheKey?: (descriptor: import("../urlDescriptor.js").UrlDescriptor) => string, singleUrl?: boolean }} */
    #options;

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
     * @param {{
     *     loadModules: () => Promise<M>,
     *     createHandle: (descriptor: import("../urlDescriptor.js").UrlDescriptor, modules: M) => Promise<H>,
     *     cacheKey?: (descriptor: import("../urlDescriptor.js").UrlDescriptor) => string,
     *     singleUrl?: boolean,
     * }} options
     * @protected
     */
    setupUrlLoading(options) {
        this.#options = options;

        const wait = () => withoutExprRef(this.params.debounce);
        const mode = this.params.debounceMode;
        if (mode == "domain") {
            this.onDomainChanged = debounce(
                this.onDomainChanged.bind(this),
                wait,
                false
            );
        } else if (mode == "window") {
            this.#debouncedRequest = debounce(
                this.#debouncedRequest,
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
        const windowSize = withoutExprRef(this.params.windowSize) ?? -1;
        if (domain[1] - domain[0] <= windowSize) {
            const interval = this.getChangedWindow(domain, windowSize);
            if (interval) this.#debouncedRequest(interval, windowSize);
        }
    }

    /**
     * @param {number[]} domain
     * @protected
     */
    queueDomain(domain) {
        this.#lastDomain = domain;
        this.#debouncedRequest(domain);
    }

    /**
     * @param {number[]} domain
     * @param {number} [windowSize]
     */
    async requestInterval(domain, windowSize) {
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
                const loaded = await this.loadWindow(domain, handles, signal);
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
    async loadWindow(interval, handles, signal) {
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

        const modules = await this.#options.loadModules();
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
            this.#options.cacheKey?.(descriptor) ??
            urlDescriptorKey(descriptor);
        let promise = this.#handleCache.get(key);
        if (!promise) {
            promise = this.#options
                .createHandle(descriptor, modules)
                .catch((error) => {
                    this.#handleCache.delete(key);
                    throw error;
                });
            this.#handleCache.set(key, promise);
        }
        return promise;
    }

    async #normalize() {
        const options = {
            url: this.params.url,
            indexUrl: this.params.indexUrl,
            baseUrl: this.view.getBaseUrl(),
            paramRuntime: this.paramRuntime,
        };
        try {
            const descriptors = await normalizeUrlDescriptors(options);
            if (this.#options.singleUrl && descriptors.length !== 1) {
                throw new Error(
                    `Data source "${this.label}" supports exactly one resolved URL.`
                );
            }
            return descriptors;
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
