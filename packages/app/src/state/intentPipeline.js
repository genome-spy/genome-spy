/**
 * @typedef {import("@reduxjs/toolkit").Action} Action
 * @typedef {import("@reduxjs/toolkit").EnhancedStore<import("./setupStore.js").AppState>} AppStore
 */
import { intentStatusSlice } from "./intentStatusSlice.js";

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
 * @prop {AbortController | undefined} abortController
 */

/**
 * @typedef {object} ActionHook
 * @prop {(action: Action) => boolean} predicate
 * @prop {(context: IntentContext, action: Action) => Promise<void>} [ensure]
 * @prop {(context: IntentContext, action: Action) => Promise<void>} [awaitProcessed]
 */

/**
 * @typedef {object} SubmitOptions
 * @prop {AbortSignal} [signal]
 * @prop {import("../sampleView/compositeAttributeInfoSource.js").AttributeInfoSource} [getAttributeInfo]
 */

/**
 * Async intent orchestrator for sequential action processing.
 *
 * It coordinates attribute-availability checks, action hooks, and dispatching
 * while preserving the synchronous intent executor. Submissions are serialized
 * and batches are rejected if other work is already running.
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

    /** @type {import("../sampleView/compositeAttributeInfoSource.js").AttributeInfoSource | undefined} */
    #getAttributeInfo;

    /** @type {Set<ActionHook>} */
    #actionHooks = new Set();

    /** @type {AbortController | undefined} */
    #currentAbortController;

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
            getAttributeInfo:
                options?.getAttributeInfo ?? this.#getAttributeInfo,
            signal: options?.signal,
        };
    }

    /**
     * Registers default resolver hooks that are reused for submissions.
     *
     * @param {object} resolvers
     * @param {import("../sampleView/compositeAttributeInfoSource.js").AttributeInfoSource} [resolvers.getAttributeInfo]
     */
    setResolvers({ getAttributeInfo }) {
        this.#getAttributeInfo = getAttributeInfo;
    }

    /**
     * Registers an action hook for non-attribute async dependencies.
     * Use this for actions that must wait for readiness signals (e.g. metadata).
     *
     * @param {ActionHook} hook
     * @returns {() => void}
     */
    registerActionHook(hook) {
        this.#actionHooks.add(hook);
        return () => {
            this.#actionHooks.delete(hook);
        };
    }

    /**
     * Submit a single action or a batch of actions for asynchronous processing.
     * The pipeline will ensure data availability before augmentation/dispatch
     * and will process batches sequentially.
     *
     * @param {Action | Action[]} actionsInput
     * @param {SubmitOptions} [options]
     * @returns {Promise<void>}
     */
    async submit(actionsInput, options) {
        const actions = Array.isArray(actionsInput)
            ? actionsInput
            : [actionsInput];
        const isBatch = actions.length > 1;
        if (this.#isBatchRunning) {
            throw new Error("Cannot submit actions while a batch is running.");
        }
        if (isBatch && this.#isRunning) {
            throw new Error("Cannot submit a batch while actions are running.");
        }

        return new Promise((resolve, reject) => {
            const abortController = options?.signal
                ? undefined
                : new AbortController();
            const resolvedOptions = abortController
                ? { ...options, signal: abortController.signal }
                : options;
            this.#queue.push({
                actions,
                options: resolvedOptions,
                resolve,
                reject,
                abortController,
            });
            if (!this.#isRunning) {
                void this.#drainQueue().catch(/** @returns {void} */ () => {});
            }
        });
    }

    abortCurrent() {
        if (this.#currentAbortController) {
            this.#currentAbortController.abort();
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async #drainQueue() {
        if (this.#isRunning) {
            return;
        }
        this.#isRunning = true;
        let failed = false;

        try {
            while (this.#queue.length) {
                const entry = /** @type {QueueEntry} */ (this.#queue.shift());
                const isBatch = entry.actions.length > 1;
                if (isBatch) {
                    this.#isBatchRunning = true;
                }

                const startIndex =
                    this.#store.getState().provenance.past.length;
                let lastSuccessfulIndex = startIndex;
                this.#store.dispatch(
                    intentStatusSlice.actions.setRunning({
                        startIndex,
                    })
                );

                this.#currentAbortController = entry.abortController;

                let currentAction;
                try {
                    for (const action of entry.actions) {
                        currentAction = action;
                        await this.#processAction(action, entry.options);
                        lastSuccessfulIndex =
                            this.#store.getState().provenance.past.length;
                    }
                    entry.resolve();
                } catch (error) {
                    failed = true;
                    const failure =
                        error instanceof Error
                            ? error
                            : new Error(String(error));
                    this.#store.dispatch(
                        intentStatusSlice.actions.setError({
                            startIndex,
                            lastSuccessfulIndex,
                            failedAction: currentAction,
                            error: failure.message,
                        })
                    );
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
            this.#currentAbortController = undefined;
            if (!failed) {
                this.#store.dispatch(intentStatusSlice.actions.clearStatus());
            }
        }
    }

    /**
     * @param {Action} action
     * @param {SubmitOptions} [options]
     */
    async #processAction(action, options) {
        const context = this.createContext(options);
        if (context.signal?.aborted) {
            throw new Error("Action processing was aborted.");
        }
        // Extract attribute identifiers from payloads that follow the
        // sample action shape: payload.attribute.type.
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

        // Ensure required data before dispatch so action augmenters can rely on it.
        if (attributeInfo?.ensureAvailability) {
            await attributeInfo.ensureAvailability({
                signal: context.signal,
            });
        }

        context.intentExecutor.dispatch(action);

        // Await any post-dispatch processing that feeds back into state or data.
        if (attributeInfo?.awaitProcessed) {
            await attributeInfo.awaitProcessed({
                signal: context.signal,
            });
        }

        // Run additional hooks for actions that don't use AttributeInfo.
        // TODO: If a hook needs pre-dispatch work, split hooks into explicit
        // before/after phases instead of assuming post-dispatch execution.
        for (const hook of this.#actionHooks) {
            if (!hook.predicate(action)) {
                continue;
            }
            if (hook.ensure) {
                await hook.ensure(context, action);
            }
            if (hook.awaitProcessed) {
                await hook.awaitProcessed(context, action);
            }
        }
    }
}
