import { createSlice } from "@reduxjs/toolkit";

/**
 * @typedef {"idle" | "running" | "error" | "canceled"} IntentStatusType
 *
 * @typedef {object} IntentStatus
 * @prop {IntentStatusType} status
 * @prop {number} [startIndex]
 * @prop {string} [error]
 */

/** @type {IntentStatus} */
const initialState = {
    status: "idle",
};

export const intentStatusSlice = createSlice({
    name: "intentStatus",
    initialState,
    reducers: {
        setRunning: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{startIndex?: number}>} */
            action
        ) => ({
            ...state,
            status: "running",
            startIndex: action.payload.startIndex,
            error: undefined,
        }),

        setError: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{startIndex?: number, error: string}>} */
            action
        ) => ({
            ...state,
            status: "error",
            startIndex: action.payload.startIndex ?? state.startIndex,
            error: action.payload.error,
        }),

        setCanceled: (state) => ({
            ...state,
            status: "canceled",
        }),

        resolveError: (
            /** @type {IntentStatus} */ state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{decision: "rollback" | "accept"}>} */ action
        ) => initialState,

        clearStatus: () => initialState,
    },
});
