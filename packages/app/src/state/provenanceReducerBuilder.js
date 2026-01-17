import { combineReducers } from "@reduxjs/toolkit";
import undoable from "redux-undo";
import { isString } from "vega-util";

/**
 * AUGMENTED_KEY is used to store augmented information in action payloads.
 * It is stripped out before storing the action in provenance history, to avoid
 * polluting the intent action with extra data.
 */
export const AUGMENTED_KEY = "_augmented";

/**
 * Create a predicate that returns true for actions whose type starts with
 * any of the provided reducer keys.
 *
 * @param {string[]|{[key:string]: import('redux').Reducer}} reducerKeys
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
 * @template {import("@reduxjs/toolkit").Action} T
 * @param {T} action
 */
export function stripAugmentation(action) {
    if ("payload" in action) {
        const payload = action.payload;
        if (typeof payload === "object" && AUGMENTED_KEY in payload) {
            // eslint-disable-next-line no-unused-vars
            const { [AUGMENTED_KEY]: augmented, ...rest } = payload;
            return { ...action, payload: rest };
        }
    }

    return action;
}

/**
 * Create an action recorder reducer that stores the last matching action.
 *
 * @param {(action:any)=>boolean} filterFn
 * @returns {import('redux').Reducer}
 */
export function createActionRecorder(filterFn) {
    return (state, action) =>
        filterFn(action) ? stripAugmentation(action) : (state ?? null);
}

/**
 * Build an undoable provenance reducer from a reducers map and a filter.
 *
 * @template T
 * @param {import('redux').ReducersMapObject<T>} reducersMap
 * @param {object} [opts]
 * @returns {import('redux').Reducer<import('redux-undo').StateWithHistory<T & { lastAction: any }>, any>}
 */
export function createProvenanceReducer(reducersMap, opts = {}) {
    const filter = makeFilterAction(reducersMap);
    const actionRecorder = createActionRecorder(filter);
    const combined = combineReducers({
        ...reducersMap,
        lastAction: actionRecorder,
    });
    // @ts-ignore - redux-undo type definitions have complex generics
    return undoable(combined, {
        filter: filter,
        ignoreInitialState: true,
        ...opts,
    });
}
