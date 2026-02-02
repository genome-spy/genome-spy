import { describe, expect, it } from "vitest";
import { intentStatusSlice } from "./intentStatusSlice.js";

describe("intentStatusSlice", () => {
    it("sets running state with start index", () => {
        const next = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setRunning({
                startIndex: 3,
            })
        );

        expect(next).toEqual({
            status: "running",
            startIndex: 3,
            error: undefined,
        });
    });

    it("sets error state and preserves startIndex when omitted", () => {
        const running = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setRunning({
                startIndex: 2,
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
            error: "Boom",
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
