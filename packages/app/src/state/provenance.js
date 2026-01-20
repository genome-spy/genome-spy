/**
 * @typedef {import("@reduxjs/toolkit").Action} Action
 *
 * @typedef {object} ActionInfo
 * @prop {string | import("lit").TemplateResult} title A title shown in
 *      context menus or provenance tracking
 * @prop {string | import("lit").TemplateResult} [provenanceTitle] A title
 *      shown in the provenance tracking, if defined. Replaces the normal title.
 * @prop {string | import("lit").TemplateResult} [attributeName]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 */

import { ActionCreators } from "redux-undo";

/**
 * An API for undo/redo and action history.
 */
export default class Provenance {
    /** @type {import('@reduxjs/toolkit').EnhancedStore<import("./setupStore.js").AppState>} */
    #store;

    /** @type {import("./intentExecutor.js").default<any>} */
    #intentExecutor;

    /**
     * @param {import('@reduxjs/toolkit').EnhancedStore<import("./setupStore.js").AppState>} store
     * @param {import("./intentExecutor.js").default<any>} intentExecutor
     */
    constructor(store, intentExecutor) {
        this.#store = store;
        this.#intentExecutor = intentExecutor;

        /** @type {((action: Action) => ActionInfo)[]} */
        this.actionInfoSources = [];
    }

    get store() {
        return this.#store;
    }

    get _provenanceState() {
        return this.#store.getState().provenance;
    }

    /**
     * Is provenance (undo/redo) enabled
     */
    isEnabled() {
        return !!this.getPresentState();
    }

    /**
     * Returns the *present* state, i.e., the one having provenance info.
     */
    getPresentState() {
        return this._provenanceState.present;
    }

    /**
     *
     * @param {(action: Action) => ActionInfo} source
     */
    addActionInfoSource(source) {
        this.actionInfoSources.push(source);
    }

    // Provenance is an API-only helper; reducer construction/composition is
    // handled by application bootstrap code (e.g. `app.js`).

    /**
     * @param {Action} action
     * @returns {ActionInfo}
     */
    getActionInfo(action) {
        for (const source of this.actionInfoSources) {
            const info = source(action);
            if (info) {
                return info;
            }
        }
    }

    /**
     * Returns to the initial state and batches the bookmarked actions
     *
     * @param {Action[]} actions Bookmarked actions
     */
    dispatchBookmark(actions) {
        if (this.isUndoable()) {
            this.#intentExecutor.dispatch(ActionCreators.jumpToPast(0));
        }
        for (const action of actions) {
            this.#intentExecutor.dispatch(action);
        }
    }

    isRedoable() {
        return this.isEnabled() && this._provenanceState.future.length > 0;
    }

    redo() {
        this.#store.dispatch(ActionCreators.redo());
    }

    isUndoable() {
        return this.isEnabled() && this._provenanceState.past.length > 0;
    }

    undo() {
        this.#store.dispatch(ActionCreators.undo());
    }

    isAtInitialState() {
        return !this.isUndoable();
    }

    isEmpty() {
        const state = this._provenanceState;
        return (
            !this.isEnabled() || state.past.length + state.future.length <= 0
        );
    }

    /**
     *
     * @param {number} index
     */
    activateState(index) {
        const current = this.getCurrentIndex();
        if (index < current) {
            this.#store.dispatch(ActionCreators.jumpToPast(index));
        } else if (index > current) {
            this.#store.dispatch(
                ActionCreators.jumpToFuture(index - current - 1)
            );
        }
    }

    getCurrentIndex() {
        return this._provenanceState.past?.length;
    }

    /**
     * Returns the history up to the current node
     *
     * @returns {Action[]}
     */
    getActionHistory() {
        // TODO: Selector
        const state = this._provenanceState;
        return (
            state.present &&
            [...state.past, state.present].map((entry) => entry.lastAction)
        );
    }

    /**
     * @returns {Action[]}
     */
    getFullActionHistory() {
        // TODO: Selector
        const state = this._provenanceState;
        return [...state.past, state.present, ...state.future].map(
            (entry) => entry.lastAction
        );
    }

    /**
     * Returns actions that can be bookmarked. The indices cannot be used
     * to jump to a specific point in history.
     */
    getBookmarkableActionHistory() {
        // Skip the initial action (that sets samples)
        // TODO: Come up with something more robust
        return this.getActionHistory()?.slice(1);
    }
}
