import { describe, expect, it } from "vitest";
import { intentStatusSlice } from "./intentStatusSlice.js";

describe("intentStatusSlice", () => {
    it("sets running state with batch metadata", () => {
        const next = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setRunning({
                batchId: "b1",
                startIndex: 3,
            })
        );

        expect(next).toEqual({
            status: "running",
            batchId: "b1",
            startIndex: 3,
            error: undefined,
        });
    });

    it("sets error state and preserves startIndex when omitted", () => {
        const running = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setRunning({
                batchId: "b2",
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
            batchId: "b2",
            startIndex: 2,
            error: "Boom",
        });
    });

    it("sets canceled state and clears on reset", () => {
        const canceled = intentStatusSlice.reducer(
            undefined,
            intentStatusSlice.actions.setCanceled({ batchId: "b3" })
        );

        expect(canceled).toEqual({
            status: "canceled",
            batchId: "b3",
        });

        const cleared = intentStatusSlice.reducer(
            canceled,
            intentStatusSlice.actions.clearStatus()
        );

        expect(cleared).toEqual({ status: "idle" });
    });
});
