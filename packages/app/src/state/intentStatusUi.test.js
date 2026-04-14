// @ts-check
import { describe, expect, it, vi, beforeEach } from "vitest";
import { attachIntentStatusUi } from "./intentStatusUi.js";
import { intentStatusSlice } from "./intentStatusSlice.js";

vi.mock("../components/dialogs/intentStatusDialog.js", () => ({
    showIntentStatusDialog: vi.fn(),
}));

vi.mock("../components/dialogs/intentErrorDialog.js", () => ({
    showIntentErrorDialog: vi.fn(),
}));

import { showIntentErrorDialog } from "../components/dialogs/intentErrorDialog.js";

/**
 * @returns {import("@reduxjs/toolkit").Store & {setState?: (action: any) => void}}
 */
function createStore() {
    /** @type {{intentStatus: import("./intentStatusSlice.js").IntentStatus}} */
    let state = {
        intentStatus: { status: "idle" },
    };
    /** @type {Set<() => void>} */
    const listeners = new Set();

    return {
        getState: () => state,
        dispatch: (action) => {
            state = {
                intentStatus: intentStatusSlice.reducer(
                    state.intentStatus,
                    action
                ),
            };
            for (const listener of listeners) {
                listener();
            }
            return action;
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("attachIntentStatusUi", () => {
    it("opens the error dialog for bookmark submissions", async () => {
        const store = createStore();
        const intentPipeline = {
            abortCurrent: vi.fn(),
        };
        const provenance = {
            getActionInfo: vi.fn(),
        };

        const detach = attachIntentStatusUi({
            store: /** @type {any} */ (store),
            intentPipeline: /** @type {any} */ (intentPipeline),
            provenance: /** @type {any} */ (provenance),
            delayMs: 0,
            minVisibleMs: 0,
        });

        store.dispatch(
            intentStatusSlice.actions.setError({
                error: "Boom",
                submissionKind: "bookmark",
            })
        );

        await Promise.resolve();
        expect(showIntentErrorDialog).toHaveBeenCalledTimes(1);
        detach();
    });

    it("opens the error dialog for user submissions", async () => {
        const store = createStore();
        const intentPipeline = {
            abortCurrent: vi.fn(),
        };
        const provenance = {
            getActionInfo: vi.fn(),
        };

        showIntentErrorDialog.mockResolvedValue("accept");

        const detach = attachIntentStatusUi({
            store: /** @type {any} */ (store),
            intentPipeline: /** @type {any} */ (intentPipeline),
            provenance: /** @type {any} */ (provenance),
            delayMs: 0,
            minVisibleMs: 0,
        });

        store.dispatch(
            intentStatusSlice.actions.setError({
                error: "Boom",
                submissionKind: "user",
            })
        );

        await Promise.resolve();
        expect(showIntentErrorDialog).toHaveBeenCalledTimes(1);
        detach();
    });

    it("does not open the error dialog for agent submissions", async () => {
        const store = createStore();
        const intentPipeline = {
            abortCurrent: vi.fn(),
        };
        const provenance = {
            getActionInfo: vi.fn(),
        };

        const detach = attachIntentStatusUi({
            store: /** @type {any} */ (store),
            intentPipeline: /** @type {any} */ (intentPipeline),
            provenance: /** @type {any} */ (provenance),
            delayMs: 0,
            minVisibleMs: 0,
        });

        store.dispatch(
            intentStatusSlice.actions.setError({
                error: "Boom",
                submissionKind: "agent",
            })
        );

        await Promise.resolve();
        expect(showIntentErrorDialog).not.toHaveBeenCalled();
        detach();
    });
});
