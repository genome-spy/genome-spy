import { describe, expect, it } from "vitest";
import { intentStatusSlice } from "./intentStatusSlice.js";

describe("intentStatusSlice", () => {
    it("sets running state with start index", () => {
        const next = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setRunning({
                startIndex: 3,
                totalActions: 5,
            })
        );

        expect(next).toEqual({
            status: "running",
            startIndex: 3,
            lastSuccessfulIndex: 3,
            totalActions: 5,
            currentIndex: 0,
            currentAction: undefined,
            failedAction: undefined,
            error: undefined,
        });
    });

    it("sets error state and preserves startIndex when omitted", () => {
        const running = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setRunning({
                startIndex: 2,
                totalActions: 2,
            })
        );
        const errored = intentStatusSlice.reducer(
            running,
            intentStatusSlice.actions.setError({
                error: "Boom",
            })
        );

        expect(errored).toEqual({
            status: "error",
            startIndex: 2,
            lastSuccessfulIndex: 2,
            totalActions: 2,
            currentIndex: 0,
            currentAction: undefined,
            failedAction: undefined,
            error: "Boom",
        });
    });

    it("updates progress while running", () => {
        const running = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setRunning({
                startIndex: 1,
                totalActions: 3,
            })
        );
        const action = { type: "sample/progress" };
        const progress = intentStatusSlice.reducer(
            running,
            intentStatusSlice.actions.setProgress({
                currentIndex: 1,
                currentAction: action,
            })
        );

        expect(progress).toEqual({
            status: "running",
            startIndex: 1,
            lastSuccessfulIndex: 1,
            totalActions: 3,
            currentIndex: 1,
            currentAction: action,
            failedAction: undefined,
            error: undefined,
        });
    });

    it("sets canceled state and clears on reset", () => {
        const canceled = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setCanceled()
        );

        expect(canceled).toEqual({
            status: "canceled",
        });

        const cleared = intentStatusSlice.reducer(
            canceled,
            intentStatusSlice.actions.clearStatus()
        );

        expect(cleared).toEqual({ status: "idle" });
    });

    it("clears error state via resolveError", () => {
        const errored = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setError({
                error: "Boom",
                startIndex: 1,
            })
        );

        const resolved = intentStatusSlice.reducer(
            errored,
            intentStatusSlice.actions.resolveError({ decision: "accept" })
        );

        expect(resolved).toEqual({ status: "idle" });
    });
});
