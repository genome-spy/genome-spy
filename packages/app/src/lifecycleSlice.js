import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    appInitialized: false,
    cohortTransitioning: false,
    hierarchyRevision: 0,
};

export const lifecycleSlice = createSlice({
    name: "lifecycle",
    initialState,
    reducers: {
        setCohortTransitioning: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<boolean>} */ action
        ) => {
            state.cohortTransitioning = action.payload;
        },
        hierarchyChanged: (state) => {
            state.hierarchyRevision++;
        },
        setInitialized: (state) => {
            if (state.appInitialized) {
                throw new Error("App is already initialized");
            }
            state.appInitialized = true;
        },
    },
});
