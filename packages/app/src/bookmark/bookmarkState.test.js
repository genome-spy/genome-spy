// @ts-check
import { describe, expect, it, vi } from "vitest";
import { createBookmarkWithCurrentState } from "./bookmarkState.js";

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
        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                provenance: {
                    getBookmarkableActionHistory: vi.fn(() => [
                        { type: "sample/action" },
                    ]),
                },
                genomeSpy: {
                    viewRoot: undefined,
                    getNamedScaleResolutions: vi.fn(
                        () =>
                            new Map([
                                [
                                    "x",
                                    {
                                        isZoomable: () => true,
                                        getComplexDomain: () => [1, 2],
                                    },
                                ],
                            ])
                    ),
                },
                store: {
                    getState: vi.fn(() => ({
                        viewSettings: { visibilities: {} },
                    })),
                },
            })
        );

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
                plotType: "bar",
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "status" },
            },
        };
        const plots = [plot];
        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                provenance: {
                    getBookmarkableActionHistory: vi.fn(() => []),
                },
                genomeSpy: {
                    viewRoot: undefined,
                    getNamedScaleResolutions: vi.fn(() => new Map()),
                },
                store: {
                    getState: vi.fn(() => ({
                        viewSettings: { visibilities: {} },
                    })),
                },
            })
        );

        const bookmark = createBookmarkWithCurrentState(app, { plots });
        plots.length = 0;

        expect(bookmark.plots).toEqual([plot]);
    });
});
