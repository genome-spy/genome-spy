import { getViewIdentityRegistry } from "../view/viewIdentityRegistry.js";

/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("../data/sources/dataSource.js").default} DataSource
 * @typedef {import("../types/viewContext.js").DataLoadingStatus} DataLoadingStatus
 * @typedef {import("../types/embedApi.js").DataLoadingEntry} DataLoadingEntry
 * @typedef {import("../types/embedApi.js").DataLoadingChange} DataLoadingChange
 * @typedef {{status: DataLoadingStatus, detail?: string}} LoadingStatus
 */

/** Source outcomes and separate root initialization/runtime indicators. */
export default class LoadingStatusRegistry {
    /** @type {Map<View, LoadingStatus>} */
    #statuses = new Map();

    /** @type {Map<DataSource, DataLoadingEntry>} */
    #sources = new Map();

    /** @type {Set<(change: DataLoadingChange) => void>} */
    #listeners = new Set();

    /** @type {Set<() => void>} */
    #observers = new Set();

    #nextId = 0;

    /**
     * @param {DataSource} source
     * @param {DataLoadingStatus} status
     * @param {string} [message]
     * @param {DataLoadingEntry["errorPhase"]} [errorPhase]
     * @param {import("../types/embedApi.js").SpecLocation} [errorLocation]
     */
    setSource(source, status, message, errorPhase, errorLocation) {
        if (source.disposed) return;

        let entry = this.#sources.get(source);
        if (!entry) {
            const view = source.view;
            const root = view.getLayoutAncestors().at(-1);
            entry = {
                sourceId: "source-" + this.#nextId++,
                viewId: getViewIdentityRegistry(root).getId(view),
                viewPath: view.getPathString(),
                ...(source.origin === undefined
                    ? {}
                    : { origin: source.origin }),
                status,
            };
            const sourceId = entry.sourceId;
            source.registerDisposer(() => {
                this.#sources.delete(source);
                this.#publish({ type: "remove", sourceId });
            });
        }

        entry = { ...entry, status };
        delete entry.message;
        delete entry.errorPhase;
        delete entry.errorLocation;
        if (status === "error")
            Object.assign(entry, { message, errorPhase, errorLocation });
        this.#sources.set(source, entry);
        this.#publish({ type: "update", entry });
    }

    /** @param {DataLoadingChange} change */
    #publish(change) {
        for (const listener of this.#listeners) {
            try {
                listener(structuredClone(change));
            } catch (error) {
                // Host callbacks must not turn a successful load into a failed one.
                queueMicrotask(() => reportError(error));
            }
        }
        this.#notify();
    }

    #notify() {
        for (const observer of this.#observers) observer();
    }

    /** @returns {DataLoadingEntry[]} */
    getSnapshot() {
        return Array.from(this.#sources.values(), (entry) =>
            structuredClone(entry)
        );
    }

    /** @param {DataSource} source */
    getSource(source) {
        return this.#sources.get(source);
    }

    /**
     * @param {View} view
     * @param {DataLoadingStatus} status
     * @param {string} [detail]
     */
    set(view, status, detail) {
        this.#statuses.set(view, { status, detail });
        this.#notify();
    }

    /** @param {View} view */
    delete(view) {
        this.#statuses.delete(view);
        this.#notify();
    }

    entries() {
        return this.#statuses.entries();
    }

    /** @param {(change: DataLoadingChange) => void} listener */
    subscribe(listener) {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    /** @param {() => void} observer */
    observe(observer) {
        this.#observers.add(observer);
        return () => {
            this.#observers.delete(observer);
        };
    }

    clear() {
        this.#listeners.clear();
        this.#observers.clear();
        this.#sources.clear();
        this.#statuses.clear();
    }
}
