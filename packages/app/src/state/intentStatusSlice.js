import { createSlice } from "@reduxjs/toolkit";

/**
 * @typedef {"idle" | "running" | "error" | "canceled"} IntentStatusType
 *
 * @typedef {object} IntentStatus
 * @prop {IntentStatusType} status
 * @prop {string} [batchId]
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
            /** @type {import("@reduxjs/toolkit").PayloadAction<{batchId?: string, startIndex?: number}>} */
            action
        ) => ({
            ...state,
            status: "running",
            batchId: action.payload.batchId,
            startIndex: action.payload.startIndex,
            error: undefined,
        }),

        setError: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{batchId?: string, startIndex?: number, error: string}>} */
            action
        ) => ({
            ...state,
            status: "error",
            batchId: action.payload.batchId ?? state.batchId,
            startIndex: action.payload.startIndex ?? state.startIndex,
            error: action.payload.error,
        }),

        setCanceled: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{batchId?: string}>} */
            action
        ) => ({
            ...state,
            status: "canceled",
            batchId: action.payload.batchId ?? state.batchId,
        }),

        clearStatus: () => initialState,
    },
});
