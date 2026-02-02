import { createSlice } from "@reduxjs/toolkit";

/**
 * @typedef {"idle" | "running" | "error" | "canceled"} IntentStatusType
 *
 * @typedef {object} IntentStatus
 * @prop {IntentStatusType} status
 * @prop {number} [startIndex]
 * @prop {number} [lastSuccessfulIndex]
 * @prop {import("@reduxjs/toolkit").Action} [failedAction]
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
            lastSuccessfulIndex: action.payload.startIndex,
            failedAction: undefined,
            error: undefined,
        }),

        setError: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{startIndex?: number, lastSuccessfulIndex?: number, failedAction?: import("@reduxjs/toolkit").Action, error: string}>} */
            action
        ) => ({
            ...state,
            status: "error",
            startIndex: action.payload.startIndex ?? state.startIndex,
            lastSuccessfulIndex:
                action.payload.lastSuccessfulIndex ?? state.lastSuccessfulIndex,
            failedAction: action.payload.failedAction ?? state.failedAction,
            error: action.payload.error,
        }),

        setCanceled: (state) => ({
            ...state,
            status: "canceled",
        }),

        resolveError: (
            /** @type {IntentStatus} */ state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{decision: "rollbackBatch" | "accept"}>} */ action
        ) => initialState,

        clearStatus: () => initialState,
    },
});
