import { combineReducers, configureStore } from "@reduxjs/toolkit";
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

    return configureStore({
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({ serializableCheck: false }),
        reducer: combineReducers({
            lifecycle: lifecycleSlice.reducer,
            viewSettings: viewSettingsSlice.reducer,
            intentStatus: intentStatusSlice.reducer,
            provenance: provenanceReducer,
        }),
    });
}
