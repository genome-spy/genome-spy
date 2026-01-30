/**
 * @typedef {import("@reduxjs/toolkit").Action} Action
 * @typedef {import("@reduxjs/toolkit").EnhancedStore<import("./setupStore.js").AppState>} AppStore
 */

/**
 * @typedef {object} IntentContext
 * @prop {AppStore} store
 * @prop {import("./provenance.js").default} provenance
 * @prop {import("./intentExecutor.js").default<any>} intentExecutor
 * @prop {AbortSignal | undefined} signal
 */

/**
 * @typedef {object} SubmitOptions
 * @prop {AbortSignal} [signal]
 * @prop {string} [batchId]
 */

/**
 * Async intent orchestrator for sequential action processing.
 *
 * It provides a shared context for ensure/processed hooks and will eventually
 * handle queueing, batch execution, and failure signaling while keeping the
 * synchronous intent executor unchanged.
 */
export default class IntentPipeline {
    /** @type {AppStore} */
    #store;

    /** @type {import("./provenance.js").default} */
    #provenance;

    /** @type {import("./intentExecutor.js").default<any>} */
    #intentExecutor;

    /**
     * @param {object} deps Dependencies used to build the shared intent context.
     * @param {AppStore} deps.store
     * @param {import("./provenance.js").default} deps.provenance
     * @param {import("./intentExecutor.js").default<any>} deps.intentExecutor
     */
    constructor({ store, provenance, intentExecutor }) {
        this.#store = store;
        this.#provenance = provenance;
        this.#intentExecutor = intentExecutor;
    }

    /**
     * Returns a shared context object for ensure/processed hooks.
     * The context keeps dependencies together and carries cancellation signals.
     *
     * @param {SubmitOptions} [options]
     * @returns {IntentContext}
     */
    createContext(options) {
        return {
            store: this.#store,
            provenance: this.#provenance,
            intentExecutor: this.#intentExecutor,
            signal: options?.signal,
        };
    }

    /**
     * Submit a single action or a batch of actions for asynchronous processing.
     * The pipeline will ensure data availability before augmentation/dispatch
     * and will process batches sequentially.
     *
     * @param {Action | Action[]} _actions
     * @param {SubmitOptions} [options]
     * @returns {Promise<void>}
     */
    async submit(_actions, options) {
        void this.createContext(options);
        throw new Error("Async intent pipeline is not implemented yet.");
    }
}
