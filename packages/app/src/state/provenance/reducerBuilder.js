import { combineReducers } from "@reduxjs/toolkit";
import undoable from "redux-undo";
import { isString } from "vega-util";

/**
 * Create a predicate that returns true for actions whose type starts with
 * any of the provided reducer keys.
 * @param {string[]|import('redux').ReducersMapObject} reducerKeys
 * @returns {(action:any)=>boolean}
 */
export function makeFilterAction(reducerKeys) {
    return (/** @type {any} */ action) => {
        const keys = Array.isArray(reducerKeys)
            ? reducerKeys
            : Object.keys(reducerKeys);
        return keys.some((key) => isString(key) && action.type.startsWith(key));
    };
}

/**
 * Create an action recorder reducer that stores the last matching action.
 * @param {(action:any)=>boolean} filterFn
 * @returns {import('redux').Reducer}
 */
export function createActionRecorder(filterFn) {
    return (state, action) => (filterFn(action) ? action : (state ?? null));
}

/**
 * Build an undoable provenance reducer from a reducers map and a filter.
 * @param {import('redux').ReducersMapObject} reducersMap
 * @param {(action:any)=>boolean} filterFn
 * @param {object} [opts]
 * @returns {import('redux').Reducer}
 */
export function createProvenanceReducer(reducersMap, filterFn, opts = {}) {
    const actionRecorder = createActionRecorder(filterFn);
    const combined = combineReducers({
        ...reducersMap,
        lastAction: actionRecorder,
    });
    return undoable(combined, {
        filter: filterFn,
        ignoreInitialState: true,
        ...opts,
    });
}
