export default class EventListenerRegistry {
    /** @type {Map<string, Set<(event: any) => void>>} */
    #listeners;

    constructor() {
        this.#listeners = new Map();
    }

    /**
     * @param {string} type
     * @param {(event: any) => void} listener
     */
    add(type, listener) {
        let listeners = this.#listeners.get(type);
        if (!listeners) {
            listeners = new Set();
            this.#listeners.set(type, listeners);
        }

        listeners.add(listener);
    }

    /**
     * @param {string} type
     * @param {(event: any) => void} listener
     */
    remove(type, listener) {
        this.#listeners.get(type)?.delete(listener);
    }

    /**
     * @param {string} type
     * @param {any} event
     * @param {(error: unknown) => void} [onError]
     */
    emit(type, event, onError) {
        if (!onError) {
            this.#listeners.get(type)?.forEach((listener) => listener(event));
            return;
        }

        this.#listeners.get(type)?.forEach((listener) => {
            try {
                listener(event);
            } catch (error) {
                onError(error);
            }
        });
    }

    clear() {
        this.#listeners.clear();
    }
}
