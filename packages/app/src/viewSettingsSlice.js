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
            /** @type {PayloadAction<{key: string, visibility: boolean}>} */ action
        ) => {
            state.visibilities[action.payload.key] = action.payload.visibility;
        },

        setViewSettings: (
            _state,
            /** @type {PayloadAction<import("./state.js").ViewSettings>} */ action
        ) => ({
            ...initialState,
            ...(action.payload ? action.payload : {}),
        }),
    },
});
