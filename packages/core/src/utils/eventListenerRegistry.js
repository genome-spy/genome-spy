export default class EventListenerRegistry {
    constructor() {
        /** @type {Map<string, Set<(event: any) => void>>} */
        this._listeners = new Map();
    }

    /**
     * @param {string} type
     * @param {(event: any) => void} listener
     */
    add(type, listener) {
        let listeners = this._listeners.get(type);
        if (!listeners) {
            listeners = new Set();
            this._listeners.set(type, listeners);
        }

        listeners.add(listener);
    }

    /**
     * @param {string} type
     * @param {(event: any) => void} listener
     */
    remove(type, listener) {
        this._listeners.get(type)?.delete(listener);
    }

    /**
     * @param {string} type
     * @param {any} event
     */
    emit(type, event) {
        this._listeners.get(type)?.forEach((listener) => listener(event));
    }
}
