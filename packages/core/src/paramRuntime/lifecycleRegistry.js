export default class LifecycleRegistry {
    #nextOwnerId = 1;

    /** @type {Map<string, Set<() => void>>} */
    #ownerDisposers = new Map();

    /**
     * @param {"view" | "mark" | "transform" | "source" | "scope"} kind
     * @param {string} key
     */
    createOwner(kind, key) {
        const ownerId = kind + ":" + key + ":" + this.#nextOwnerId++;
        this.#ownerDisposers.set(ownerId, new Set());
        return ownerId;
    }

    /**
     * @param {string} ownerId
     * @param {() => void} disposer
     */
    addDisposer(ownerId, disposer) {
        const disposers = this.#ownerDisposers.get(ownerId);
        if (!disposers) {
            throw new Error("Unknown owner: " + ownerId);
        }

        disposers.add(disposer);
    }

    /**
     * @param {string} ownerId
     */
    disposeOwner(ownerId) {
        const disposers = this.#ownerDisposers.get(ownerId);
        if (!disposers) {
            return;
        }

        for (const disposer of disposers) {
            disposer();
        }
        disposers.clear();
        this.#ownerDisposers.delete(ownerId);
    }
}
