import { createSlice } from "@reduxjs/toolkit";

/**
 * @template P
 * @typedef {import("@reduxjs/toolkit").PayloadAction<P>} PayloadAction
 */

const initialState = {
    /** @type {Record<string, boolean>} */
    viewVisibilities: {},
};

export const viewSettingsSlice = createSlice({
    name: "viewSettings",
    initialState,
    reducers: {
        setVisibility: (
            state,
            /** @type {PayloadAction<{name: string, visibility: boolean}>} */ action
        ) => {
            state.viewVisibilities[action.payload.name] =
                action.payload.visibility;
        },
        restoreDefaultVisibility: (
            state,
            /** @type {PayloadAction<string>} */ action
        ) => {
            delete state.viewVisibilities[action.payload];
        },
    },
});
