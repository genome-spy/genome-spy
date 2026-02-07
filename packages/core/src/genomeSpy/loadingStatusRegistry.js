/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("../types/viewContext.js").DataLoadingStatus} DataLoadingStatus
 * @typedef {{ status: DataLoadingStatus, detail?: string }} LoadingStatus
 * @typedef {{ view: View, status: DataLoadingStatus, detail?: string }} LoadingStatusChange
 */

/**
 * Central registry for per-view loading status that decouples data sources
 * from UI rendering. Consumers can subscribe to changes and query the current
 * status map when needed (e.g., for overlay rendering).
 */
export default class LoadingStatusRegistry {
    /** @type {Map<View, LoadingStatus>} */
    #statuses = new Map();

    /** @type {Set<(change: LoadingStatusChange) => void>} */
    #listeners = new Set();

    /**
     * @param {View} view
     * @param {DataLoadingStatus} status
     * @param {string} [detail]
     */
    set(view, status, detail) {
        if (!view) {
            throw new Error("LoadingStatusRegistry.set requires a view.");
        }

        this.#statuses.set(view, { status, detail });

        const change = { view, status, detail };
        for (const listener of this.#listeners) {
            listener(change);
        }
    }

    /**
     * @param {View} view
     */
    delete(view) {
        const previous = this.#statuses.get(view);
        if (!previous) {
            return;
        }

        this.#statuses.delete(view);

        const change = {
            view,
            status: previous.status,
            detail: previous.detail,
        };
        for (const listener of this.#listeners) {
            listener(change);
        }
    }

    /**
     * @param {View} view
     * @returns {LoadingStatus | undefined}
     */
    get(view) {
        return this.#statuses.get(view);
    }

    /**
     * @returns {IterableIterator<[View, LoadingStatus]>}
     */
    entries() {
        return this.#statuses.entries();
    }

    /**
     * Subscribe to status changes.
     *
     * @param {(change: LoadingStatusChange) => void} listener
     * @returns {() => void} Unsubscribe callback
     */
    subscribe(listener) {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }
}
