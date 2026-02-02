import { createSlice } from "@reduxjs/toolkit";

/**
 * Tracks async intent execution status for UI feedback and rollback decisions.
 */

/**
 * @typedef {"idle" | "running" | "error" | "canceled"} IntentStatusType
 *
 * @typedef {object} IntentStatus
 * @prop {IntentStatusType} status
 * @prop {number} [startIndex]
 * @prop {number} [lastSuccessfulIndex]
 * @prop {number} [totalActions]
 * @prop {number} [currentIndex]
 * @prop {import("@reduxjs/toolkit").Action} [currentAction]
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
            /** @type {import("@reduxjs/toolkit").PayloadAction<{startIndex?: number, totalActions?: number}>} */
            action
        ) => ({
            ...state,
            status: "running",
            startIndex: action.payload.startIndex,
            lastSuccessfulIndex: action.payload.startIndex,
            totalActions: action.payload.totalActions,
            currentIndex: 0,
            currentAction: undefined,
            failedAction: undefined,
            error: undefined,
        }),

        setProgress: (
            state,
            /** @type {import("@reduxjs/toolkit").PayloadAction<{currentIndex?: number, totalActions?: number, currentAction?: import("@reduxjs/toolkit").Action}>} */ action
        ) => ({
            ...state,
            status: "running",
            currentIndex:
                action.payload.currentIndex ?? state.currentIndex ?? 0,
            totalActions: action.payload.totalActions ?? state.totalActions,
            currentAction: action.payload.currentAction ?? state.currentAction,
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
        ) =>
            // The actual rollback decision is handled by the root reducer in
            // setupStore; this slice only clears the status.
            initialState,

        clearStatus: () => initialState,
    },
});
