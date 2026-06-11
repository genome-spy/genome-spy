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
        expect(intentPipeline.submit).toHaveBeenCalledWith(entry.actions, {
            submissionKind: "bookmark",
        });
        expect(paramProvenanceBridge.whenApplied).toHaveBeenCalled();
    });

    it("waits for metadata readiness after provenance reset before submitting actions", async () => {
        /** @type {import("./databaseSchema.js").BookmarkEntry} */
        const entry = {
            name: "metadata-bookmark",
            actions: /** @type {any} */ ([
                {
                    type: "sampleView/groupByNominal",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "Annotations/Lineage",
                        },
                    },
                },
            ]),
        };

        /** @type {string[]} */
        const calls = [];
        const store = {
            dispatch: vi.fn(),
            getState: () => ({ intentStatus: undefined }),
        };
        const intentPipeline = {
            submit: vi.fn(() => {
                calls.push("submit");
                return Promise.resolve();
            }),
        };
        const sampleView = {
            awaitMetadataReady: vi.fn(() => {
                calls.push("metadata-ready");
                return Promise.resolve();
            }),
        };
        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                store,
                intentPipeline,
                paramProvenanceBridge: {
                    whenApplied: vi.fn(() => Promise.resolve()),
                },
                getSampleView: vi.fn(() => sampleView),
                provenance: {
                    isUndoable: () => true,
                    activateInitialState: vi.fn(() => {
                        calls.push("reset");
                    }),
                },
                genomeSpy: {
                    getNamedScaleResolutions: () => new Map(),
                },
            })
        );

        await restoreBookmark(entry, app);

        expect(calls).toEqual(["reset", "metadata-ready", "submit"]);
    });

    it("rebuilds plot attachments after restoring bookmark state", async () => {
        /** @type {import("./databaseSchema.js").BookmarkEntry} */
        const entry = {
            name: "plot-bookmark",
            plots: [
                {
                    kind: "sample_attribute_plot",
                    request: {
                        plotType: "boxplot",
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "score",
                        },
                    },
                },
            ],
        };
        const buildSampleAttributePlot = vi.fn(async () => ({
            kind: "sample_attribute_plot",
            title: "Boxplot of score",
        }));
        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                store: {
                    dispatch: vi.fn(),
                    getState: () => ({ intentStatus: undefined }),
                },
                provenance: {
                    isUndoable: () => false,
                    activateInitialState: vi.fn(),
                },
                genomeSpy: {
                    getNamedScaleResolutions: () => new Map(),
                },
                getAgentApi: vi.fn(async () => ({
                    buildSampleAttributePlot,
                })),
            })
        );

        const results = await restoreBookmark(entry, app);

        expect(buildSampleAttributePlot).toHaveBeenCalledWith(
            entry.plots[0].request
        );
        expect(results.plots).toEqual([
            {
                attachment: entry.plots[0],
                plot: {
                    kind: "sample_attribute_plot",
                    title: "Boxplot of score",
                },
            },
        ]);
    });

    it("captures plot rebuild errors without aborting bookmark restore", async () => {
        /** @type {import("./databaseSchema.js").BookmarkEntry} */
        const entry = {
            name: "broken-plot-bookmark",
            plots: [
                {
                    kind: "sample_attribute_plot",
                    request: {
                        plotType: "bar",
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "missing",
                        },
                    },
                },
            ],
        };
        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                store: {
                    dispatch: vi.fn(),
                    getState: () => ({ intentStatus: undefined }),
                },
                provenance: {
                    isUndoable: () => false,
                    activateInitialState: vi.fn(),
                },
                genomeSpy: {
                    getNamedScaleResolutions: () => new Map(),
                },
                getAgentApi: vi.fn(async () => ({
                    buildSampleAttributePlot: vi.fn(async () => {
                        throw new Error("No such attribute: missing");
                    }),
                })),
            })
        );

        const results = await restoreBookmark(entry, app);

        expect(app.store.dispatch).toHaveBeenCalled();
        expect(results.plots).toHaveLength(1);
        expect(results.plots[0]).toMatchObject({
            attachment: entry.plots[0],
            error: "No such attribute: missing",
        });
    });

    it("returns an empty plot result when intent restore reports an error", async () => {
        /** @type {import("./databaseSchema.js").BookmarkEntry} */
        const entry = {
            name: "intent-error-bookmark",
            actions: /** @type {any} */ ([
                { type: "sample/add", payload: { value: 1 } },
            ]),
        };
        const app = /** @type {import("../app.js").default} */ (
            /** @type {any} */ ({
                store: {
                    dispatch: vi.fn(),
                    getState: () => ({
                        intentStatus: { status: "error" },
                    }),
                },
                intentPipeline: {
                    submit: vi.fn(async () => {
                        throw new Error("Intent failed");
                    }),
                },
                provenance: {
                    isUndoable: () => false,
                    activateInitialState: vi.fn(),
                },
                genomeSpy: {
                    getNamedScaleResolutions: () => new Map(),
                },
            })
        );

        await expect(restoreBookmark(entry, app)).resolves.toEqual({
            plots: [],
        });
    });
});
