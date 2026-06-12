import {
    loadUrlDescriptorOrSkip,
    UrlLimitExceededError,
    urlDescriptorKey,
} from "./urlDescriptor.js";

/**
 * Tracks active URL descriptors, descriptor-keyed handles, and the descriptor
 * set covered by the last published data batch.
 *
 * @template T
 */
export default class UrlDescriptorState {
    /** @type {Map<string, T>} */
    #handleCache = new Map();

    /** @type {T[]} */
    #handles = [];

    /** @type {Set<string>} */
    #activeKeys = new Set();

    /** @type {Set<string>} */
    #loadedKeys = new Set();

    get handles() {
        return this.#handles;
    }

    get activeSetLoaded() {
        return this.#activeKeys.isSubsetOf(this.#loadedKeys);
    }

    markLoaded() {
        this.#loadedKeys = new Set(this.#activeKeys);
    }

    clearActive() {
        this.#handles = [];
        this.#activeKeys = new Set();
        this.#loadedKeys = new Set();
    }

    /**
     * Refreshes active descriptors while reusing cached handles.
     *
     * @param {import("./urlDescriptor.js").UrlDescriptor[]} descriptors
     * @param {(descriptor: import("./urlDescriptor.js").UrlDescriptor, descriptorKey: string) => Promise<T | undefined>} createHandle
     */
    async update(descriptors, createHandle) {
        const descriptorKeys = descriptors.map(urlDescriptorKey);
        const entries = await Promise.all(
            descriptors.map((descriptor, i) =>
                this.#getOrCreateHandle(
                    descriptor,
                    descriptorKeys[i],
                    createHandle
                )
            )
        );
        this.#handles = entries
            .filter((entry) => entry.handle)
            .map((entry) => /** @type {T} */ (entry.handle));
        this.#activeKeys = new Set(
            entries
                .filter((entry) => entry.handle)
                .map((entry) => entry.descriptorKey)
        );
    }

    /**
     * @param {import("./urlDescriptor.js").UrlDescriptor} descriptor
     * @param {string} descriptorKey
     * @param {(descriptor: import("./urlDescriptor.js").UrlDescriptor, descriptorKey: string) => Promise<T | undefined>} createHandle
     * @returns {Promise<{ descriptorKey: string, handle: T | undefined }>}
     */
    async #getOrCreateHandle(descriptor, descriptorKey, createHandle) {
        const cachedHandle = this.#handleCache.get(descriptorKey);
        if (cachedHandle) {
            return { descriptorKey, handle: cachedHandle };
        }

        const handle = await createHandle(descriptor, descriptorKey);
        if (handle) {
            this.#handleCache.set(descriptorKey, handle);
        }
        return { descriptorKey, handle };
    }
}

/**
 * Updates descriptor-backed lazy-source handles using the shared multi-URL
 * loading policy. Over-limit URL expansion is treated as an empty completed
 * source so stale data is cleared without surfacing a runtime error.
 *
 * @template T
 * @template M
 * @param {{
 *     controller: { normalize: () => Promise<import("./urlDescriptor.js").UrlDescriptor[]> },
 *     state: UrlDescriptorState<T>,
 *     clearData: () => void,
 *     setLoadingStatus: (status: import("../../types/viewContext.js").DataLoadingStatus, detail?: string) => void,
 *     loadModules: () => Promise<M>,
 *     createHandle: (descriptor: import("./urlDescriptor.js").UrlDescriptor, modules: M) => Promise<T>,
 * }} options
 */
export async function updateUrlDescriptorState(options) {
    try {
        const descriptors = await options.controller.normalize();
        const modules = await options.loadModules();

        options.setLoadingStatus("loading");
        await options.state.update(descriptors, (descriptor) =>
            loadUrlDescriptorOrSkip(descriptor, () =>
                options.createHandle(descriptor, modules)
            )
        );
        options.setLoadingStatus("complete");
    } catch (e) {
        options.clearData();
        if (e instanceof UrlLimitExceededError) {
            options.state.clearActive();
            options.setLoadingStatus("complete");
        } else {
            options.setLoadingStatus("error", e.message);
            throw e;
        }
    }
}
