/**
 * @implements {ReactiveController}
 */
export default class SubscriptionController {
    /**
     * @typedef {import("lit").ReactiveController} ReactiveController
     * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
     */

    /** @type {ReactiveControllerHost} */
    #host;

    /** @type {Set<() => void>} */
    #cleanupCallbacks = new Set();

    /**
     * @param {ReactiveControllerHost} host
     */
    constructor(host) {
        this.#host = host;
        this.#host.addController(this);
    }

    /**
     * @param {() => void} callback
     */
    addUnsubscribeCallback(callback) {
        this.#cleanupCallbacks.add(callback);
    }

    hostConnected() {}

    hostDisconnected() {
        this.#cleanupCallbacks.forEach((cb) => cb());
        this.#cleanupCallbacks.clear();
    }

    hostUpdate() {}

    hostUpdated() {}
}
