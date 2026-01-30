/**
 * @typedef {import("@reduxjs/toolkit").Action} Action
 * @typedef {import("@reduxjs/toolkit").EnhancedStore<import("./setupStore.js").AppState>} AppStore
 */

/**
 * @typedef {object} IntentContext
 * @prop {AppStore} store
 * @prop {import("./provenance.js").default} provenance
 * @prop {import("./intentExecutor.js").default<any>} intentExecutor
 * @prop {import("../sampleView/compositeAttributeInfoSource.js").AttributeInfoSource | undefined} getAttributeInfo
 * @prop {AbortSignal | undefined} signal
 */

/**
 * @typedef {object} QueueEntry
 * @prop {Action[]} actions
 * @prop {SubmitOptions | undefined} options
 * @prop {() => void} resolve
 * @prop {(error: Error) => void} reject
 */

/**
 * @typedef {object} SubmitOptions
 * @prop {AbortSignal} [signal]
 * @prop {string} [batchId]
 * @prop {import("../sampleView/compositeAttributeInfoSource.js").AttributeInfoSource} [getAttributeInfo]
 * @prop {(signal?: AbortSignal) => Promise<void>} [awaitMetadataReady]
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

    /** @type {QueueEntry[]} */
    #queue = [];

    #isRunning = false;
    #isBatchRunning = false;

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
            getAttributeInfo: options?.getAttributeInfo,
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
        const actions = Array.isArray(_actions) ? _actions : [_actions];
        const isBatch = actions.length > 1;
        if (this.#isBatchRunning) {
            throw new Error("Cannot submit actions while a batch is running.");
        }
        if (isBatch && this.#isRunning) {
            throw new Error("Cannot submit a batch while actions are running.");
        }

        return new Promise((resolve, reject) => {
            this.#queue.push({ actions, options, resolve, reject });
            if (!this.#isRunning) {
                void this.#drainQueue().catch(/** @returns {void} */ () => {});
            }
        });
    }

    /**
     * @returns {Promise<void>}
     */
    async #drainQueue() {
        if (this.#isRunning) {
            return;
        }
        this.#isRunning = true;

        try {
            while (this.#queue.length) {
                const entry = /** @type {QueueEntry} */ (this.#queue.shift());
                const isBatch = entry.actions.length > 1;
                if (isBatch) {
                    this.#isBatchRunning = true;
                }

                try {
                    for (const action of entry.actions) {
                        await this.#processAction(action, entry.options);
                    }
                    entry.resolve();
                } catch (error) {
                    const failure =
                        error instanceof Error
                            ? error
                            : new Error(String(error));
                    entry.reject(failure);
                    const remaining = this.#queue;
                    this.#queue = [];
                    for (const queuedEntry of remaining) {
                        queuedEntry.reject(failure);
                    }
                    throw failure;
                }

                if (isBatch) {
                    this.#isBatchRunning = false;
                }
            }
        } finally {
            this.#isRunning = false;
            this.#isBatchRunning = false;
        }
    }

    /**
     * @param {Action} action
     * @param {SubmitOptions} [options]
     */
    async #processAction(action, options) {
        const context = this.createContext(options);
        const payload = "payload" in action ? action.payload : undefined;
        const attribute =
            payload &&
            typeof payload === "object" &&
            "attribute" in payload &&
            /** @type {any} */ (payload).attribute?.type
                ? /** @type {import("../sampleView/types.js").AttributeIdentifier} */ (
                      /** @type {any} */ (payload).attribute
                  )
                : undefined;
        const attributeInfo =
            attribute && context.getAttributeInfo
                ? context.getAttributeInfo(attribute)
                : undefined;

        if (attributeInfo?.ensureAvailability) {
            await attributeInfo.ensureAvailability({
                signal: context.signal,
            });
        }

        context.intentExecutor.dispatch(action);

        if (attributeInfo?.awaitProcessed) {
            await attributeInfo.awaitProcessed({
                signal: context.signal,
            });
        }

        if (
            options?.awaitMetadataReady &&
            action.type === "sampleView/addMetadata"
        ) {
            await options.awaitMetadataReady(context.signal);
        }
    }
}
