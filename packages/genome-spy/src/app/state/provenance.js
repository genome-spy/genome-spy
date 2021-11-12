/**
 * @typedef {import("@reduxjs/toolkit").AnyAction} Action
 *
 * @typedef {object} ActionInfo
 * @prop {string | import("lit").TemplateResult} title A title shown in
 *      context menus or provenance tracking
 * @prop {string | import("lit").TemplateResult} [provenanceTitle] A title
 *      shown in the provenance tracking, if defined. Replaces the normal title.
 * @prop {string} [attributeName]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 */

import { combineReducers, createReducer } from "@reduxjs/toolkit";
import undoable, { ActionCreators } from "redux-undo";

/**
 * Handles provenance, undo/redo, etc. In practice, this is a thin
 * wrapper around Redux store. Provides some practical methods.
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
     *
     * @param {import("./storeHelper").default} storeHelper
     */
    constructor(storeHelper) {
        this.storeHelper = storeHelper;

        /**
         * Undoable reducers
         * @type {import("redux").ReducersMapObject}
         */
        this._reducers = {};

        /** @type {((action: Action) => ActionInfo)[]} */
        this.actionInfoSources = [];

        /** @type {import("redux").Reducer} */
        this._reducer = undefined;

        storeHelper.addReducer("provenance", (state, action) =>
            this._reducer ? this._reducer(state, action) : state ?? {}
        );
    }

    /**
     *
     * @param {string} name
     * @param {import("redux").Reducer} reducer
     */
    addReducer(name, reducer) {
        this._reducers[name] = reducer;

        const filterAction = (/** @type {Action} */ action) =>
            Object.keys(this._reducers).some((key) =>
                action.type.startsWith(key)
            );

        this._reducer = undoable(
            combineReducers({
                ...this._reducers,
                lastAction: actionRecorder,
            }),
            {
                ignoreInitialState: true,
                filter: filterAction,
            }
        );

        // Set the initial state. Need to hack a bit because we aren't replacing
        // the Store's reducer.
        this.storeHelper.dispatch({
            type:
                "@@redux/REPLACE" +
                Math.random().toString(36).substring(7).split("").join("."),
        });
    }

    get _storeState() {
        return this.storeHelper.store.getState();
    }

    /**
     * @returns {import("redux-undo").StateWithHistory<S & { lastAction: Action }>}
     */
    get _provenanceState() {
        return this._storeState.provenance;
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
        this.storeHelper.dispatch([
            ...(this.isUndoable() ? [ActionCreators.jumpToPast(0)] : []),
            ...actions,
        ]);
    }

    isRedoable() {
        return this.isEnabled() && this._provenanceState.future.length > 0;
    }

    redo() {
        this.storeHelper.dispatch(ActionCreators.redo());
    }

    isUndoable() {
        return this.isEnabled() && this._provenanceState.past.length > 0;
    }

    undo() {
        this.storeHelper.dispatch(ActionCreators.undo());
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
            this.storeHelper.dispatch(ActionCreators.jumpToPast(index));
        } else if (index > current) {
            this.storeHelper.dispatch(
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

const actionRecorder = createReducer(undefined, (builder) => {
    builder.addDefaultCase((state, action) => action);
});
