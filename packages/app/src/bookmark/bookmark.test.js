import { describe, expect, it, vi } from "vitest";
import { ActionCreators } from "redux-undo";
import { restoreBookmark } from "./bookmark.js";

describe("bookmark restore", () => {
    it("resets provenance and submits actions through the intent pipeline", async () => {
        // Non-obvious: we stub only the pieces used by restoreBookmark.
        /** @type {import("./databaseSchema.js").BookmarkEntry} */
        const entry = {
            actions: [
                { type: "sample/add", payload: { value: 1 } },
                { type: "sample/add", payload: { value: 2 } },
            ],
        };

        const storeDispatch = vi.fn();
        const store = {
            dispatch: storeDispatch,
            getState: () => ({ intentStatus: undefined }),
        };

        const intentPipeline = {
            submit: vi.fn(() => Promise.resolve()),
        };

        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                store,
                intentPipeline,
                provenance: {
                    isUndoable: () => true,
                    activateState: vi.fn(),
                },
                genomeSpy: {
                    getNamedScaleResolutions: () => new Map(),
                },
            })
        );

        await restoreBookmark(entry, app);

        expect(storeDispatch).toHaveBeenCalledWith(
            ActionCreators.jumpToPast(0)
        );
        expect(intentPipeline.submit).toHaveBeenCalledWith(entry.actions);
    });
});
