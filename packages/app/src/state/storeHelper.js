import { combineReducers, configureStore } from "@reduxjs/toolkit";

/**
 * @typedef {import("@reduxjs/toolkit").Action} Action
 */

/**
 * Provides some convenience stuff for redux store
 *
 * @template T
 */
export default class StoreHelper {
    /**
     * @param {import("redux").ReducersMapObject} [reducers]
     */
    constructor(reducers) {
        this._reducers = reducers ?? {};

        // TODO: The actual store could be outside of Provenance so that it could
        // also include non-undoable reducers
        this.store = configureStore({
            reducer: {},
        });
    }

    get state() {
        return /** @type {T} */ (this.store.getState());
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

    getDispatcher() {
        return (/** @type {Action} */ action) => this.store.dispatch(action);
    }
}
