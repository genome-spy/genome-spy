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
    /** @type {Map<string, Promise<T | undefined>>} */
    #handleCache = new Map();

    /** @type {T[]} */
    #handles = [];

    /** @type {Set<string>} */
    #activeKeys = new Set();

    /** @type {Set<string>} */
    #loadedKeys = new Set();

    #revision = 0;
    #updating = true;

    get activeSetLoaded() {
        return !this.#updating && this.#activeKeys.isSubsetOf(this.#loadedKeys);
    }

    get activeHandles() {
        return this.#updating ? undefined : this.#handles;
    }

    beginUpdate() {
        this.#handles = [];
        this.#activeKeys = new Set();
        this.#updating = true;
        return ++this.#revision;
    }

    /** @param {number} revision */
    isCurrent(revision) {
        return revision === this.#revision;
    }

    markLoaded() {
        if (!this.#updating) {
            this.#loadedKeys = new Set(this.#activeKeys);
        }
    }

    dispose() {
        this.beginUpdate();
        this.#handleCache.clear();
    }

    clearActive() {
        this.#loadedKeys = new Set();
        this.#updating = false;
    }

    /**
     * Refreshes active descriptors while reusing cached handles.
     *
     * @param {import("./urlDescriptor.js").UrlDescriptor[]} descriptors
     * @param {(descriptor: import("./urlDescriptor.js").UrlDescriptor, descriptorKey: string) => Promise<T | undefined>} createHandle
     * @param {number} revision
     */
    async update(descriptors, createHandle, revision = this.beginUpdate()) {
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
        if (revision !== this.#revision) {
            return;
        }
        this.#handles = entries
            .filter((entry) => entry.handle)
            .map((entry) => /** @type {T} */ (entry.handle));
        this.#activeKeys = new Set(
            entries
                .filter((entry) => entry.handle)
                .map((entry) => entry.descriptorKey)
        );
        this.#updating = false;
    }

    /**
     * @param {import("./urlDescriptor.js").UrlDescriptor} descriptor
     * @param {string} descriptorKey
     * @param {(descriptor: import("./urlDescriptor.js").UrlDescriptor, descriptorKey: string) => Promise<T | undefined>} createHandle
     * @returns {Promise<{ descriptorKey: string, handle: T | undefined }>}
     */
    async #getOrCreateHandle(descriptor, descriptorKey, createHandle) {
        let handlePromise = this.#handleCache.get(descriptorKey);
        if (!handlePromise) {
            handlePromise = createHandle(descriptor, descriptorKey);
            this.#handleCache.set(descriptorKey, handlePromise);
            const forget = () => {
                if (this.#handleCache.get(descriptorKey) === handlePromise) {
                    this.#handleCache.delete(descriptorKey);
                }
            };
            handlePromise.then((handle) => !handle && forget(), forget);
        }

        return { descriptorKey, handle: await handlePromise };
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
 *     normalize: () => Promise<import("./urlDescriptor.js").UrlDescriptor[]>,
 *     state: UrlDescriptorState<T>,
 *     clearData: () => void,
 *     setLoadingStatus: (status: import("../../types/viewContext.js").DataLoadingStatus, detail?: string) => void,
 *     loadModules: () => Promise<M>,
 *     createHandle: (descriptor: import("./urlDescriptor.js").UrlDescriptor, modules: M) => Promise<T>,
 *     revision: number,
 * }} options
 */
export async function updateUrlDescriptorState(options) {
    try {
        options.setLoadingStatus("loading");
        const descriptors = await options.normalize();
        const modules = await options.loadModules();

        await options.state.update(
            descriptors,
            (descriptor) =>
                loadUrlDescriptorOrSkip(descriptor, () =>
                    options.createHandle(descriptor, modules)
                ),
            options.revision
        );
        if (options.state.isCurrent(options.revision)) {
            options.setLoadingStatus("complete");
        }
    } catch (e) {
        if (!options.state.isCurrent(options.revision)) {
            return;
        }
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
