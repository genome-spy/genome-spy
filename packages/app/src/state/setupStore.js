import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { sampleSlice } from "../sampleView/sampleSlice.js";
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
    const provenanceReducer = createProvenanceReducer(
        { [sampleSlice.name]: sampleSlice.reducer },
        { ignoreInitialState: true }
    );

    return configureStore({
        reducer: combineReducers({
            lifecycle: lifecycleSlice.reducer,
            viewSettings: viewSettingsSlice.reducer,
            provenance: provenanceReducer,
        }),
    });
}
