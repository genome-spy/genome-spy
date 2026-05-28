// @ts-check
import { describe, expect, it, vi } from "vitest";
import {
    createMetadataSourceRuntime,
    getMetadataSourceRuntime,
} from "./metadataSourceRuntimeState.js";

/**
 * @returns {import("../sampleView.js").default}
 */
function createSampleViewStub() {
    return /** @type {import("../sampleView.js").default} */ (
        /** @type {unknown} */ ({
            spec: {
                metadata: {
                    sources: [
                        {
                            id: "clinical",
                            name: "Clinical",
                            initialLoad: false,
                            backend: {
                                backend: "data",
                                data: {
                                    values: [
                                        {
                                            sample: "s1",
                                            status: "A",
                                            score: 1,
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
            getBaseUrl: () => "https://example.org/spec.json",
        })
    );
}

describe("createMetadataSourceRuntime", () => {
    it("returns one shared runtime per SampleView", () => {
        const sampleView = createSampleViewStub();
        const otherSampleView = createSampleViewStub();

        expect(getMetadataSourceRuntime(sampleView)).toBe(
            getMetadataSourceRuntime(sampleView)
        );
        expect(getMetadataSourceRuntime(otherSampleView)).not.toBe(
            getMetadataSourceRuntime(sampleView)
        );
    });

    it("resolves sources once and reuses adapters", async () => {
        const loadJson = vi.fn();
        const runtime = createMetadataSourceRuntime(createSampleViewStub(), {
            loadJson,
        });

        const firstSources = await runtime.getSources();
        const secondSources = await runtime.getSources();
        const firstAdapter = await runtime.getAdapter(firstSources[0]);
        const secondAdapter = await runtime.getAdapter(secondSources[0]);

        expect(secondSources).toBe(firstSources);
        expect(secondAdapter).toBe(firstAdapter);
        expect(loadJson).not.toHaveBeenCalled();
    });

    it("resolves imported sources once and retries after failed imports", async () => {
        const sampleView = createSampleViewStub();
        sampleView.spec.metadata.sources = [
            {
                import: {
                    url: "metadata.json",
                },
            },
        ];
        const loadJson = vi
            .fn()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce({
                id: "clinical",
                initialLoad: false,
                backend: {
                    backend: "data",
                    data: {
                        values: [{ sample: "s1", status: "A" }],
                    },
                },
            });
        const runtime = createMetadataSourceRuntime(sampleView, {
            loadJson,
        });

        await expect(runtime.getSources()).rejects.toThrow("network");
        const sources = await runtime.getSources();
        const secondSources = await runtime.getSources();

        expect(sources[0].id).toBe("clinical");
        expect(secondSources).toBe(sources);
        expect(loadJson).toHaveBeenCalledTimes(2);
    });

    it("does not use abort signals for shared source resolution", async () => {
        const sampleView = createSampleViewStub();
        sampleView.spec.metadata.sources = [
            {
                import: {
                    url: "metadata.json",
                },
            },
        ];
        const controller = new AbortController();
        const loadJson = vi.fn(
            (
                _url,
                /** @type {AbortSignal | undefined} */
                signal
            ) => {
                if (signal?.aborted) {
                    throw new Error("aborted");
                }

                return Promise.resolve({
                    id: "clinical",
                    initialLoad: false,
                    backend: {
                        backend: "data",
                        data: {
                            values: [{ sample: "s1", status: "A" }],
                        },
                    },
                });
            }
        );
        const runtime = createMetadataSourceRuntime(sampleView, {
            loadJson,
            signal: controller.signal,
        });

        controller.abort();
        const sources = await runtime.getSources();

        expect(sources[0].id).toBe("clinical");
    });

    it("builds agent summaries with reused adapters", async () => {
        const runtime = createMetadataSourceRuntime(createSampleViewStub());

        const firstSummaries = await runtime.getAgentSummaries();
        const secondSummaries = await runtime.getAgentSummaries();

        expect(secondSummaries).toBe(firstSummaries);
        expect(firstSummaries).toEqual([
            expect.objectContaining({
                sourceId: "clinical",
                name: "Clinical",
                identifiers: [
                    expect.objectContaining({
                        name: "column",
                        examples: expect.any(Array),
                    }),
                ],
            }),
        ]);
    });
});
