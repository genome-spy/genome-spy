export default class KeyboardListenerManager {
    /** @type {Map<string, Set<(event: KeyboardEvent) => void>>} */
    #listeners;

    constructor() {
        this.#listeners = new Map();
    }

    /**
     * @param {"keydown" | "keyup"} type
     * @param {(event: KeyboardEvent) => void} listener
     * @returns {() => void}
     */
    add(type, listener) {
        document.addEventListener(type, listener);
        let listeners = this.#listeners.get(type);
        if (!listeners) {
            listeners = new Set();
            this.#listeners.set(type, listeners);
        }
        listeners.add(listener);

        return () => {
            document.removeEventListener(type, listener);
            listeners.delete(listener);
        };
    }

    removeAll() {
        for (const [type, listeners] of this.#listeners) {
            for (const listener of listeners) {
                document.removeEventListener(type, listener);
            }
            listeners.clear();
        }
        this.#listeners.clear();
    }
}
