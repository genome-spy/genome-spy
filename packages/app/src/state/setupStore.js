import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { ActionCreators } from "redux-undo";
import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import { lifecycleSlice } from "../lifecycleSlice.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { intentStatusSlice } from "./intentStatusSlice.js";

/**
 * Setup the Redux store for the application.
 *
 * @typedef {ReturnType<typeof setupStore>} AppStore
 * @typedef {ReturnType<AppStore['getState']>} AppState
 */
export default function setupStore() {
    const provenanceReducer = createProvenanceReducer({
        [sampleSlice.name]: sampleSlice.reducer,
    });

    const combinedReducer = combineReducers({
        lifecycle: lifecycleSlice.reducer,
        viewSettings: viewSettingsSlice.reducer,
        intentStatus: intentStatusSlice.reducer,
        provenance: provenanceReducer,
    });

    /**
     * @param {ReturnType<typeof combinedReducer> | undefined} state
     * @param {import("@reduxjs/toolkit").AnyAction} action
     */
    const rootReducer = (state, action) => {
        const nextState = combinedReducer(state, action);

        if (action.type === intentStatusSlice.actions.resolveError.type) {
            const decision = action.payload.decision;
            if (decision === "rollback") {
                const startIndex = state?.intentStatus?.startIndex;
                if (typeof startIndex === "number") {
                    return {
                        ...nextState,
                        provenance: provenanceReducer(
                            nextState.provenance,
                            ActionCreators.jumpToPast(startIndex)
                        ),
                    };
                }
            }
        }

        return nextState;
    };

    return configureStore({
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({ serializableCheck: false }),
        reducer: rootReducer,
    });
}
