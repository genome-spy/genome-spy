/**
 * @typedef {import("@reduxjs/toolkit").Action} Action
 *
 * @typedef {object} ActionInfo
 * @prop {string | import("lit").TemplateResult} title A title shown in
 *      context menus or provenance tracking
 * @prop {string | import("lit").TemplateResult} [provenanceTitle] A title
 *      shown in the provenance tracking, if defined. Replaces the normal title.
 * @prop {string} [attributeName]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 */

import { ActionCreators } from "redux-undo";
import { isString } from "vega-util";
import { createProvenanceReducer } from "./provenance/reducerBuilder.js";

/**
 * Handles provenance, undo/redo, etc. In practice, this is a thin
 * wrapper around Redux store and redux-undo. Provides some practical methods.
 *
 * This is somewhat inspired by:
 *     Z. T. Cutler, K. Gadhave and A. Lex,
 *     “Trrack: A Library for Provenance Tracking in Web-Based Visualizations”,
 *     osf.io preprint. https://doi.org/10.31219/osf.io/wnctb.
 * and
 *     S. Gratzl, A. Lex, N. Gehlenborg, N. Cosgrove, and M. Streit
 *     "From Visual Exploration to Storytelling and Back Again"
 *     Eurographics Conference on Visualization (EuroVis) 2016
 *     http://doi.wiley.com/10.1111/cgf.12925
 *
 * @template S State
 */
export default class Provenance {
    /**
     * @param {import('redux').ReducersMapObject} [initialReducers] optional initial
     * reducers to include in the provenance reducer (useful for static composition)
     */
    constructor(initialReducers) {
        // The store is bound later via `bindStore` so App can compose the
        // top-level reducers (including the provenance wrapper) before the
        // store exists.
        this.store = undefined;

        /**
         * Undoable reducers
         * @type {import("redux").ReducersMapObject}
         */
        this._reducers = initialReducers ?? {};

        /** @type {((action: Action) => ActionInfo)[]} */
        this.actionInfoSources = [];

        /** @type {import("redux").Reducer} */
        this._reducer = undefined;

        // If there are initial reducers, build the provenance reducer now.
        if (Object.keys(this._reducers).length > 0) {
            const filterAction = (/** @type {Action} */ action) =>
                Object.keys(this._reducers).some(
                    (key) => isString(key) && action.type.startsWith(key)
                );

            this._reducer = createProvenanceReducer(
                this._reducers,
                filterAction,
                {
                    ignoreInitialState: true,
                }
            );
        }

        // Nothing to install into the global store here — the caller (App)
        // composes a `provenance` wrapper reducer that delegates to
        // `this._reducer`. This keeps composition explicit and avoids
        // runtime dynamic reducer registration.
    }

    /**
     * Bind a concrete store to this Provenance instance so that it can
     * dispatch actions (e.g. a replace-like action) when its internal
     * reducer changes.
     * @param {import('@reduxjs/toolkit').EnhancedStore} store
     */
    bindStore(store) {
        this.store = store;

        // If we already have an internal reducer (built from initial
        // reducers), dispatch a replace-like action so any top-level
        // wrapper reducer can initialize the provenance slice.
        if (this._reducer) {
            this.store.dispatch({
                type:
                    "@@redux/REPLACE" +
                    Math.random().toString(36).substring(7).split("").join("."),
            });
        }
    }

    /**
     * @returns {import("redux-undo").StateWithHistory<S & { lastAction: Action }>}
     */
    get _provenanceState() {
        return this.store.getState().provenance;
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
            this.store.dispatch(ActionCreators.jumpToPast(0));
        }
        for (const action of actions) {
            this.store.dispatch(action);
        }
    }

    isRedoable() {
        return this.isEnabled() && this._provenanceState.future.length > 0;
    }

    redo() {
        this.store.dispatch(ActionCreators.redo());
    }

    isUndoable() {
        return this.isEnabled() && this._provenanceState.past.length > 0;
    }

    undo() {
        this.store.dispatch(ActionCreators.undo());
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
            this.store.dispatch(ActionCreators.jumpToPast(index));
        } else if (index > current) {
            this.store.dispatch(
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
