import { ActionCreators } from "redux-undo";

export const BASELINE_ACTION_SUFFIX = "/__baseline__";

/**
 * @param {import("@reduxjs/toolkit").Action | null | undefined} action
 * @returns {boolean}
 */
export function isBaselineAction(action) {
    return !!action && action.type.endsWith(BASELINE_ACTION_SUFFIX);
}

/**
 * Clears provenance history and seeds a baseline marker action so the next
 * meaningful action is immediately undoable.
 *
 * redux-undo with ignoreInitialState requires one filtered action after
 * clearHistory() before subsequent actions are pushed to history.
 *
 * @param {import("@reduxjs/toolkit").EnhancedStore<any, any, any>} store
 * @param {string} reducerPrefix
 */
export function resetProvenanceHistory(store, reducerPrefix) {
    // TODO: Remove this synthetic baseline workaround by reconfiguring
    // redux-undo in createProvenanceReducer:
    // 1) switch ignoreInitialState to false so the first post-reset action
    //    is immediately undoable without dispatching a marker action.
    // 2) ensure bootstrap/startup actions (setSamples, eager metadata loads)
    //    are excluded from user-visible provenance history.
    // 3) confirm clearHistory semantics still preserve "current state as
    //    initial state" for undo/redo and bookmarkable history.
    store.dispatch(ActionCreators.clearHistory());
    store.dispatch({
        type: reducerPrefix + BASELINE_ACTION_SUFFIX,
    });
}
