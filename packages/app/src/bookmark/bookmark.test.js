// @ts-check
import { describe, expect, it, vi } from "vitest";
import { restoreBookmark } from "./bookmark.js";

/**
 * @param {object} [overrides]
 * @param {Record<string, any>} [overrides.storeState]
 * @param {() => Promise<void>} [overrides.submit]
 * @param {boolean} [overrides.undoable]
 * @param {() => Promise<any>} [overrides.getAgentApi]
 * @param {() => any} [overrides.getSampleView]
 * @param {() => void} [overrides.onReset]
 * @returns {import("../app.js").default}
 */
function createBookmarkRestoreApp(overrides = {}) {
    return /** @type {import("../app.js").default} */ (
        /** @type {any} */ ({
            store: {
                dispatch: vi.fn(),
                getState: () => overrides.storeState ?? {},
            },
            intentPipeline: {
                submit: vi.fn(overrides.submit ?? (() => Promise.resolve())),
            },
            paramProvenanceBridge: {
                whenApplied: vi.fn(() => Promise.resolve()),
            },
            getSampleView: overrides.getSampleView,
            getAgentApi: overrides.getAgentApi,
            provenance: {
                isUndoable: () => overrides.undoable ?? false,
                activateInitialState: vi.fn(() => overrides.onReset?.()),
                activateState: vi.fn(),
            },
            genomeSpy: {
                getNamedScaleResolutions: () => new Map(),
            },
        })
    );
}

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

        const app = createBookmarkRestoreApp({ undoable: true });

        await restoreBookmark(entry, app);

        expect(app.provenance.activateInitialState).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).toHaveBeenCalledWith(entry.actions, {
            submissionKind: "bookmark",
        });
        expect(app.paramProvenanceBridge.whenApplied).toHaveBeenCalled();
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
        const sampleView = {
            awaitMetadataReady: vi.fn(() => {
                calls.push("metadata-ready");
                return Promise.resolve();
            }),
        };
        const app = createBookmarkRestoreApp({
            undoable: true,
            onReset: () => calls.push("reset"),
            getSampleView: vi.fn(() => sampleView),
            submit: () => {
                calls.push("submit");
                return Promise.resolve();
            },
        });

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
        const app = createBookmarkRestoreApp({
            getAgentApi: vi.fn(async () => ({
                buildSampleAttributePlot,
            })),
        });

        const results = await restoreBookmark(entry, app);

        expect(buildSampleAttributePlot).toHaveBeenCalledWith(
            entry.plots[0].request
        );
        expect(results.plots).toEqual([
            {
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
        const app = createBookmarkRestoreApp({
            getAgentApi: vi.fn(async () => ({
                buildSampleAttributePlot: vi.fn(async () => {
                    throw new Error("No such attribute: missing");
                }),
            })),
        });

        const results = await restoreBookmark(entry, app);

        expect(app.store.dispatch).toHaveBeenCalled();
        expect(results.plots).toHaveLength(1);
        expect(results.plots[0]).toMatchObject({
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
        const app = createBookmarkRestoreApp({
            storeState: { intentStatus: { status: "error" } },
            submit: async () => {
                throw new Error("Intent failed");
            },
        });

        await expect(restoreBookmark(entry, app)).resolves.toEqual({
            plots: [],
        });
    });
});
