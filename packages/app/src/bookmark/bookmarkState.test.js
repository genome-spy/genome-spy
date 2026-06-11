// @ts-check
import { describe, expect, it, vi } from "vitest";
import { createBookmarkWithCurrentState } from "./bookmarkState.js";

/**
 * @param {object} [options]
 * @param {import("@reduxjs/toolkit").Action[]} [options.actions]
 * @param {Map<string, any>} [options.scales]
 * @returns {import("../app.js").default}
 */
function createBookmarkStateApp(options = {}) {
    return /** @type {import("../app.js").default} */ (
        /** @type {any} */ ({
            provenance: {
                getBookmarkableActionHistory: vi.fn(
                    () => options.actions ?? []
                ),
            },
            genomeSpy: {
                viewRoot: undefined,
                getNamedScaleResolutions: vi.fn(
                    () => options.scales ?? new Map()
                ),
            },
            store: {
                getState: vi.fn(() => ({
                    viewSettings: { visibilities: {} },
                })),
            },
        })
    );
}

describe("createBookmarkWithCurrentState", () => {
    it("adds plot attachments to the current bookmark state", () => {
        /** @type {import("./databaseSchema.d.ts").BookmarkPlotAttachment} */
        const plot = {
            kind: "sample_attribute_plot",
            request: {
                plotType: "boxplot",
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "score" },
            },
        };
        const app = createBookmarkStateApp({
            actions: [{ type: "sample/action" }],
            scales: new Map([
                [
                    "x",
                    {
                        isZoomable: () => true,
                        getComplexDomain: () => [1, 2],
                    },
                ],
            ]),
        });

        const bookmark = createBookmarkWithCurrentState(app, {
            plots: [plot],
        });

        expect(bookmark).toEqual({
            name: undefined,
            actions: [{ type: "sample/action" }],
            scaleDomains: { x: [1, 2] },
            plots: [plot],
        });
    });

    it("copies the plot attachment array", () => {
        /** @type {import("./databaseSchema.d.ts").BookmarkPlotAttachment} */
        const plot = {
            kind: "sample_attribute_plot",
            request: {
                plotType: "barplot",
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "status" },
            },
        };
        const plots = [plot];
        const app = createBookmarkStateApp();

        const bookmark = createBookmarkWithCurrentState(app, { plots });
        plots.length = 0;

        expect(bookmark.plots).toEqual([plot]);
    });
});
