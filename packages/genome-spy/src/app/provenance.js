/**
 * @typedef {object} Action
 * @prop {string} type
 * @prop {any} [payload]
 *
 * @typedef {object} ActionInfo
 * @prop {string | import("lit").TemplateResult} title A title shown in
 *      context menus or provenance tracking
 * @prop {string | import("lit").TemplateResult} [provenanceTitle] A title
 *      shown in the provenance tracking, if defined. Replaces the normal title.
 * @prop {string} [attributeName]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 */

import { combineReducers, configureStore } from "@reduxjs/toolkit";

/**
 * @typedef {object} ProvenanceNode
 * @prop {S} state The full state
 * @prop {Action} [action] The action that changed the previous state to this state
 * @template S State
 */

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
    constructor() {
        /** @type {import("redux").ReducersMapObject} */
        this._reducers = {};

        this.store = configureStore({
            reducer: {},
        });

        /** @type {(function(Action):ActionInfo)[]} */
        this.actionInfoSources = [];

        /** @type {Set<(state: any) => void>} */
        this._listeners = new Set();

        this.store.subscribe(() => {
            const state = this.store.getState();
            for (const listener of this._listeners) {
                listener(state);
            }
        });
    }

    /**
     *
     * @param {string} name
     * @param {import("redux").Reducer} reducer
     */
    addReducer(name, reducer) {
        this._reducers[name] = reducer;
        this.store.replaceReducer(combineReducers(this._reducers));
    }

    /**
     * @returns {any}
     */
    getState() {
        return this.store.getState();
    }

    /**
     * @param {(state: any) => void} listener
     */
    subscribe(listener) {
        this._listeners.add(listener);
    }

    /**
     * @param {(state: any) => void} listener
     */
    unsubscribe(listener) {
        this._listeners.delete(listener);
    }

    /**
     *
     * @param {function(Action):ActionInfo} source
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
     * @param {import("@reduxjs/toolkit").AnyAction} action
     */
    dispatch(action) {
        this.store.dispatch(action);
    }

    getDispatcher() {
        return (/** @type {import("@reduxjs/toolkit").AnyAction} */ action) =>
            this.dispatch(action);
    }

    isRedoable() {
        return false;
    }

    redo() {
        //
    }

    isUndoable() {
        return false;
    }

    undo() {
        //
    }

    isAtInitialState() {
        return false;
    }

    isEmpty() {
        return false;
    }

    /**
     *
     * @param {number} index
     */
    activateState(index) {
        //
    }

    /**
     * Returns the history up to the current node
     */
    getActionHistory() {
        return [];
    }

    getFullActionHistory() {
        return [];
    }
}
