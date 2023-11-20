import { createSlice } from "@reduxjs/toolkit";

/**
 * @template P
 * @typedef {import("@reduxjs/toolkit").PayloadAction<P>} PayloadAction
 */

/** @type {import("./state.js").ViewSettings} */
const initialState = {
    visibilities: {},
};

export const viewSettingsSlice = createSlice({
    name: "viewSettings",
    initialState,
    reducers: {
        setVisibility: (
            state,
            /** @type {PayloadAction<{name: string, visibility: boolean}>} */ action
        ) => {
            state.visibilities[action.payload.name] = action.payload.visibility;
        },

        restoreDefaultVisibility: (
            state,
            /** @type {PayloadAction<string>} */ action
        ) => {
            delete state.visibilities[action.payload];
        },

        restoreDefaultVisibilities: (
            state,
            /** @type {PayloadAction<string>} */ action
        ) => initialState,

        setViewSettings: (
            _state,
            /** @type {PayloadAction<import("./state.js").ViewSettings>} */ action
        ) => ({
            ...initialState,
            ...(action.payload ? action.payload : {}),
        }),
    },
});
