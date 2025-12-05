import { combineReducers, configureStore } from "@reduxjs/toolkit";

/**
 * @typedef {import("./types.js").RootState} RootState
 */

/**
 * Create a Redux store from a static reducers map. Useful for migrating
 * away from dynamic reducer registration.
 *
 * @param {import('redux').ReducersMapObject} reducers
 * @returns {import('@reduxjs/toolkit').EnhancedStore<RootState>}
 */
export function createStore(reducers) {
    return configureStore({
        reducer: combineReducers({ ...reducers }),
    });
}
