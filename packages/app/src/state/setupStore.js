import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { createProvenanceReducer } from "./provenanceReducerBuilder.js";
import { lifecycleSlice } from "../lifecycleSlice.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";

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

    const reducer = combineReducers({
        lifecycle: lifecycleSlice.reducer,
        viewSettings: viewSettingsSlice.reducer,
        provenance: provenanceReducer,
    });

    return configureStore({
        reducer,
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({ serializableCheck: false }),
    });
}
