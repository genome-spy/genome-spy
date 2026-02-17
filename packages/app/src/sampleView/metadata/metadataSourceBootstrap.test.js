// @ts-check
import { describe, expect, it, vi } from "vitest";
import { ActionCreators } from "redux-undo";
import { sampleSlice } from "../state/sampleSlice.js";
import { bootstrapInitialMetadataSources } from "./metadataSourceBootstrap.js";

const bootstrapInitialMetadataSourcesAny = /** @type {any} */ (
    bootstrapInitialMetadataSources
);

/**
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleDef["metadataSources"]} metadataSources
 * @returns {import("../sampleView.js").default}
 */
function createSampleViewStub(metadataSources) {
    return /** @type {import("../sampleView.js").default} */ (
        /** @type {unknown} */ ({
            spec: {
                samples: {
                    metadataSources,
                },
            },
            sampleHierarchy: {
                sampleData: {
                    ids: ["s1", "s2"],
                },
            },
            provenance: {
                store: {
                    dispatch: vi.fn(),
                },
            },
            getBaseUrl: () => undefined,
        })
    );
}

describe("bootstrapInitialMetadataSources", () => {
    it("loads eager metadata sources in declaration order", async () => {
        const sampleView = createSampleViewStub([
            {
                backend: {
                    backend: "data",
                    data: {
                        values: [
                            { sample: "s1", b: 1, a: 2 },
                            { sample: "s2", b: 3, a: 4 },
                        ],
                    },
                },
            },
            {
                backend: {
                    backend: "data",
                    data: {
                        values: [
                            { sample: "s1", c: 5 },
                            { sample: "s2", c: 6 },
                        ],
                    },
                },
            },
        ]);

        const intentPipeline = {
            submit: vi.fn(async () => {}),
        };

        await bootstrapInitialMetadataSourcesAny(sampleView, intentPipeline);

        expect(intentPipeline.submit).toHaveBeenCalledTimes(1);
        const actions = /** @type {any[]} */ (
            intentPipeline.submit.mock.calls
        )[0][0];
        expect(actions).toHaveLength(2);
        expect(actions[0].payload.columnIds).toEqual(["b", "a"]);
        expect(actions[0].payload.replace).toBe(true);
        expect(actions[1].payload.columnIds).toEqual(["c"]);
        expect(actions[1].payload.replace).toBe(false);
    });

    it("supports multiple eager sources without source ids", async () => {
        const sampleView = createSampleViewStub([
            {
                backend: {
                    backend: "data",
                    data: {
                        values: [
                            { sample: "s1", x: 1 },
                            { sample: "s2", x: 2 },
                        ],
                    },
                },
            },
            {
                backend: {
                    backend: "data",
                    data: {
                        values: [
                            { sample: "s1", y: 3 },
                            { sample: "s2", y: 4 },
                        ],
                    },
                },
            },
        ]);

        const intentPipeline = {
            submit: vi.fn(async () => {}),
        };

        await expect(
            bootstrapInitialMetadataSourcesAny(sampleView, intentPipeline)
        ).resolves.toBeUndefined();

        const actions = /** @type {any[]} */ (
            intentPipeline.submit.mock.calls
        )[0][0];
        expect(actions[0].payload.sourceId).toBeUndefined();
        expect(actions[1].payload.sourceId).toBeUndefined();
    });

    it("resets provenance history after eager bootstrap", async () => {
        const sampleView = createSampleViewStub([
            {
                backend: {
                    backend: "data",
                    data: {
                        values: [
                            { sample: "s1", x: 1 },
                            { sample: "s2", x: 2 },
                        ],
                    },
                },
            },
        ]);

        const intentPipeline = {
            submit: vi.fn(async () => {}),
        };

        await bootstrapInitialMetadataSourcesAny(sampleView, intentPipeline);

        const dispatchMock = /** @type {any} */ (
            sampleView.provenance.store.dispatch
        );
        const dispatchCalls = dispatchMock.mock.calls.map((call) => call[0]);
        // Non-obvious: baseline marker primes redux-undo so next user action is undoable.
        expect(dispatchCalls).toEqual([
            { type: ActionCreators.clearHistory().type },
            { type: sampleSlice.name + "/__baseline__" },
        ]);
    });
});
