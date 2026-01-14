/**
 * @template {import("@reduxjs/toolkit").EnhancedStore<any, any, any>} S
 *
 * IntentExecutor dispatches intent actions through optional augmenters so
 * reducers receive enriched, still-serializable payloads for provenance/bookmarks.
 * This is a bit unconventional (thunks are more typical) but keeps actions
 * replayable and easily describable in provenance and bookmarks.
 */
export default class IntentExecutor {
    /**
     * @template A
     * @typedef {(action: import("@reduxjs/toolkit").PayloadAction<A>) => A} ActionAugmenter */

    /** @type {S} */
    #store;

    /** @type {Set<ActionAugmenter<any>>} */
    #augmenters = new Set();

    /**
     * @param {S} store
     */
    constructor(store) {
        this.#store = store;
    }

    /**
     * @param {import("@reduxjs/toolkit").Action} action
     * @returns {import("@reduxjs/toolkit").Action}
     */
    dispatch(action) {
        if ("payload" in action) {
            let payloadAction =
                /** @type {import("@reduxjs/toolkit").PayloadAction<any>} */ (
                    action
                );
            for (const augmenter of this.#augmenters) {
                payloadAction = augmenter(payloadAction);
            }
            action = payloadAction;
        }
        return this.#store.dispatch(action);
    }

    /**
     * @param {import("@reduxjs/toolkit").Action[]} actions
     */
    dispatchBatch(actions) {
        for (const action of actions) {
            this.dispatch(action);
        }
    }

    /**
     * @param {ActionAugmenter<any>} augmenter
     */
    addActionAugmenter(augmenter) {
        this.#augmenters.add(augmenter);
    }

    /**
     *
     * @param {ActionAugmenter<any>} augmenter
     */
    removeActionAugmenter(augmenter) {
        this.#augmenters.delete(augmenter);
    }
}
