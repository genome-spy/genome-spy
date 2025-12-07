import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    appInitialized: false,
};

export const lifecycleSlice = createSlice({
    name: "lifecycle",
    initialState,
    reducers: {
        setInitialized: (state) => {
            if (state.appInitialized) {
                throw new Error("App is already initialized");
            }
            state.appInitialized = true;
        },
    },
});
