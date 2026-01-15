export default class KeyboardListenerManager {
    constructor() {
        /**
         * @type {Map<string, (function(KeyboardEvent):void)[]>}
         */
        this._listeners = new Map();
    }

    /**
     * @param {"keydown" | "keyup"} type
     * @param {(event: KeyboardEvent) => void} listener
     */
    add(type, listener) {
        document.addEventListener(type, listener);
        let listeners = this._listeners.get(type);
        if (!listeners) {
            listeners = [];
            this._listeners.set(type, listeners);
        }
        listeners.push(listener);
    }

    removeAll() {
        for (const [type, listeners] of this._listeners) {
            for (const listener of listeners) {
                document.removeEventListener(type, listener);
            }
        }
        this._listeners.clear();
    }
}
