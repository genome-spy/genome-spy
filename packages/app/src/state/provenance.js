/**
 * @typedef {import("@reduxjs/toolkit").Action} Action
 * @typedef {Action & { provenanceId?: string }} ProvenanceAction
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
import { isBaselineAction } from "./provenanceBaseline.js";

/**
 * Adds a provenance id to dispatched actions.
 *
 * @returns {import("@reduxjs/toolkit").Middleware}
 */
export function createProvenanceIdMiddleware() {
    let nextProvenanceId = 0;

    return () => (next) => (action) => {
        if (action && typeof action == "object" && "type" in action) {
            action = {
                ...action,
                provenanceId: `provenance-${nextProvenanceId++}`,
            };
        }

        return next(action);
    };
}

/**
 * An API for undo/redo and action history.
 */
export default class Provenance {
    /** @type {import("@reduxjs/toolkit").EnhancedStore<import("./setupStore.js").AppState>} */
    #store;

    /**
     * @param {import("@reduxjs/toolkit").EnhancedStore<import("./setupStore.js").AppState>} store
     */
    constructor(store) {
        this.#store = store;

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
        const lastAction = state.present?.lastAction;
        const hasCurrentAction = !!lastAction && !isBaselineAction(lastAction);
        return (
            !this.isEnabled() ||
            (state.past.length + state.future.length <= 0 && !hasCurrentAction)
        );
    }

    /**
     * Activates a state identified by its provenance id.
     *
     * @param {string} provenanceId
     */
    activateState(provenanceId) {
        const index = this.getFullActionHistory().findIndex(
            (action) => action.provenanceId === provenanceId
        );
        if (index < 0) {
            return;
        }

        const current = this.getCurrentIndex();
        if (index < current) {
            this.#store.dispatch(ActionCreators.jumpToPast(index));
        } else if (index > current) {
            this.#store.dispatch(
                ActionCreators.jumpToFuture(index - current - 1)
            );
        }
    }

    /**
     * Activates the initial provenance state.
     */
    activateInitialState() {
        this.#store.dispatch(ActionCreators.jumpToPast(0));
    }

    getCurrentIndex() {
        return this._provenanceState.past?.length;
    }

    /**
     * Returns the history up to the current node.
     *
     * @returns {ProvenanceAction[]}
     */
    getActionHistory() {
        const state = this._provenanceState;
        return state.present
            ? [...state.past, state.present].map((entry) => entry.lastAction)
            : [...state.past].map((entry) => entry.lastAction);
    }

    /**
     * @returns {ProvenanceAction[]}
     */
    getFullActionHistory() {
        const state = this._provenanceState;
        return [...state.past, state.present, ...state.future].map(
            (entry) => entry.lastAction
        );
    }

    /**
     * Returns actions that can be bookmarked. The ids are stripped because
     * bookmarks should remain stable across dispatch sessions.
     *
     * @returns {Action[]}
     */
    getBookmarkableActionHistory() {
        return this.getActionHistory()
            .filter((action) => !isBaselineAction(action))
            .map((action) => {
                // eslint-disable-next-line no-unused-vars
                const { provenanceId, ...rest } = action;
                return rest;
            });
    }
}
