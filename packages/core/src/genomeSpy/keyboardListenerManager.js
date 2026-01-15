export default class KeyboardListenerManager {
    /** @type {Map<string, (function(KeyboardEvent):void)[]>} */
    #listeners;

    constructor() {
        this.#listeners = new Map();
    }

    /**
     * @param {"keydown" | "keyup"} type
     * @param {(event: KeyboardEvent) => void} listener
     */
    add(type, listener) {
        document.addEventListener(type, listener);
        let listeners = this.#listeners.get(type);
        if (!listeners) {
            listeners = [];
            this.#listeners.set(type, listeners);
        }
        listeners.push(listener);
    }

    removeAll() {
        for (const [type, listeners] of this.#listeners) {
            for (const listener of listeners) {
                document.removeEventListener(type, listener);
            }
        }
        this.#listeners.clear();
    }
}
