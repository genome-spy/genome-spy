// @ts-check
import { describe, expect, it, vi } from "vitest";
import { restoreBookmark } from "./bookmark.js";

describe("bookmark restore", () => {
    it("resets provenance and submits actions through the intent pipeline", async () => {
        // Non-obvious: we stub only the pieces used by restoreBookmark.
        /** @type {import("./databaseSchema.js").BookmarkEntry} */
        const entry = {
            name: "test-bookmark",
            actions: /** @type {any} */ ([
                { type: "sample/add", payload: { value: 1 } },
                { type: "sample/add", payload: { value: 2 } },
            ]),
        };

        const store = {
            dispatch: vi.fn(),
            getState: () => ({ intentStatus: undefined }),
        };

        const intentPipeline = {
            submit: vi.fn(() => Promise.resolve()),
        };

        const paramProvenanceBridge = {
            whenApplied: vi.fn(() => Promise.resolve()),
        };

        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                store,
                intentPipeline,
                paramProvenanceBridge,
                provenance: {
                    isUndoable: () => true,
                    activateInitialState: vi.fn(),
                    activateState: vi.fn(),
                },
                genomeSpy: {
                    getNamedScaleResolutions: () => new Map(),
                },
            })
        );

        await restoreBookmark(entry, app);

        expect(app.provenance.activateInitialState).toHaveBeenCalledTimes(1);
        expect(intentPipeline.submit).toHaveBeenCalledWith(entry.actions);
        expect(paramProvenanceBridge.whenApplied).toHaveBeenCalled();
    });
});
