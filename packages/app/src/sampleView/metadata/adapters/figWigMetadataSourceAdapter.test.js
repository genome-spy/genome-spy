// @ts-check
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { createMetadataSourceAdapter } from "../metadataSourceAdapters.js";
import { bootstrapInitialMetadataSources } from "../metadataSourceBootstrap.js";
import { sampleSlice } from "../../state/sampleSlice.js";

const figwig = vi.hoisted(() => ({
    loaded: vi.fn(),
    opened: vi.fn(),
    getTracks: vi.fn(),
    close: vi.fn(),
}));

vi.mock("@genome-spy/figwig", () => {
    figwig.loaded();
    return {
        FigWig: class {
            /** @param {unknown} options */
            constructor(options) {
                figwig.opened(options);
            }
            getTracks = figwig.getTracks;
            close = figwig.close;
        },
    };
});

describe("Figwig metadata tables", () => {
    beforeEach(() => {
        figwig.opened.mockReset();
        figwig.getTracks.mockReset();
        figwig.close.mockReset();
    });

    /** @param {Record<string, unknown>} [metadata] */
    function track(metadata = {}) {
        return {
            name: "001",
            metadata: {
                name: "001",
                dtype: "float32",
                group: 0,
                "Sample.age": 11.5,
                accession: "0012",
                rowLabel: "Sample one",
                active: true,
                measured: 2,
                nested: { values: [1, 2] },
                ...metadata,
            },
        };
    }

    it("loads Figwig adapter code only when the backend is selected", async () => {
        const dataAdapter = await createMetadataSourceAdapter({
            backend: {
                backend: "data",
                data: { values: [{ sample: "001", age: 11.5 }] },
            },
        });
        expect(await dataAdapter.listSampleIds()).toEqual(["001"]);
        expect(figwig.loaded).not.toHaveBeenCalled();

        const sampleView =
            /** @type {import("../../sampleView.js").default} */ (
                /** @type {unknown} */ ({
                    spec: {
                        metadata: {
                            sources: [
                                {
                                    backend: {
                                        backend: "figwig",
                                        url: "signals.fw",
                                    },
                                    initialLoad: false,
                                },
                            ],
                        },
                    },
                    sampleHierarchy: { sampleData: { ids: ["001"] } },
                    getBaseUrl: () => "https://example.org/spec.json",
                })
            );
        const pipeline =
            /** @type {import("../../../state/intentPipeline.js").default} */ (
                /** @type {unknown} */ ({ submit: vi.fn() })
            );
        await bootstrapInitialMetadataSources(sampleView, pipeline);
        expect(figwig.loaded).not.toHaveBeenCalled();

        await createMetadataSourceAdapter({
            backend: { backend: "figwig", url: "signals.fw" },
        });
        expect(figwig.loaded).toHaveBeenCalledTimes(1);
        expect(figwig.getTracks).not.toHaveBeenCalled();
    });

    it("routes a Figwig backend through the shared table pipeline and caches one metadata read", async () => {
        const metadataTrack = track({
            name: "metadata cannot replace track identity",
        });
        figwig.getTracks.mockResolvedValue([metadataTrack]);
        const adapter = await createMetadataSourceAdapter(
            {
                backend: { backend: "figwig", url: "../signals.fw" },
                attributeGroupSeparator: ".",
                excludeColumns: ["rowLabel"],
                attributes: { Sample: { type: "quantitative" } },
            },
            { baseUrl: "https://example.org/specs/metadata.json" }
        );
        const signal = new AbortController().signal;
        const [ids, columns] = await Promise.all([
            adapter.listSampleIds(signal),
            adapter.listColumns(signal),
        ]);
        expect(ids).toEqual(["001"]);
        expect(columns.map((column) => column.id)).toEqual([
            "Sample.age",
            "accession",
            "active",
            "measured",
            "nested",
        ]);
        const result = await adapter.fetchColumns({
            columnIds: [
                "Sample.age",
                "accession",
                "active",
                "measured",
                "nested",
            ],
            sampleIds: ids,
        });
        expect(result.columnarMetadata).toEqual({
            sample: ["001"],
            "Sample/age": [11.5],
            accession: ["0012"],
            active: [true],
            measured: [2],
            nested: [{ values: [1, 2] }],
        });
        expect(result.attributeDefs).toEqual({
            Sample: { type: "quantitative" },
        });
        expect(figwig.opened).toHaveBeenCalledExactlyOnceWith({
            url: "https://example.org/signals.fw",
        });
        expect(figwig.getTracks).toHaveBeenCalledExactlyOnceWith({ signal });
        expect(figwig.close).toHaveBeenCalledTimes(1);
        expect(metadataTrack.metadata["Sample.age"]).toBe(11.5);
    });

    it("bootstraps typed Figwig attributes into real sample metadata state", async () => {
        const error = new Error("Corrupt metadata");
        figwig.getTracks
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce([track()]);
        const store = configureStore({ reducer: sampleSlice.reducer });
        store.dispatch(
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "001", displayName: "Sample one", indexNumber: 0 },
                ],
            })
        );
        // The source runtime waits for the existing identity set, then imports
        // through the normal augmented action and reducer without genomic reads.
        const sampleView =
            /** @type {import("../../sampleView.js").default} */ (
                /** @type {unknown} */ ({
                    spec: {
                        metadata: {
                            sources: [
                                {
                                    id: "figwig",
                                    backend: {
                                        backend: "figwig",
                                        url: "signals.fw",
                                    },
                                    initialLoad: ["Sample.age"],
                                    attributeGroupSeparator: ".",
                                    attributes: {
                                        Sample: { type: "quantitative" },
                                    },
                                },
                            ],
                        },
                    },
                    get sampleHierarchy() {
                        return store.getState();
                    },
                    getBaseUrl: () => "https://example.org/spec.json",
                    provenance: { store },
                })
            );
        const pipeline =
            /** @type {import("../../../state/intentPipeline.js").default} */ (
                /** @type {unknown} */ ({
                    submit: async (
                        /** @type {import("@reduxjs/toolkit").UnknownAction[]} */ actions
                    ) => {
                        for (const action of actions) store.dispatch(action);
                    },
                })
            );
        const before = store.getState();
        await expect(
            bootstrapInitialMetadataSources(sampleView, pipeline)
        ).rejects.toBe(error);
        expect(store.getState()).toBe(before);
        expect(figwig.close).toHaveBeenCalledTimes(1);

        await bootstrapInitialMetadataSources(sampleView, pipeline);

        const state = store.getState();
        expect(state.sampleData.ids).toEqual(["001"]);
        expect(state.sampleMetadata.entities).toEqual({
            "001": { "Sample/age": 11.5 },
        });
        expect(state.sampleMetadata.attributeDefs.Sample.type).toBe(
            "quantitative"
        );
        expect(figwig.getTracks).toHaveBeenCalledTimes(2);
        expect(figwig.close).toHaveBeenCalledTimes(2);
    });

    it("excludes format fields and the App's reserved sample field", async () => {
        figwig.getTracks.mockResolvedValue([track({ sample: "custom value" })]);
        const adapter = await createMetadataSourceAdapter({
            backend: { backend: "figwig", url: "signals.fw" },
        });
        const reserved = ["name", "dtype", "group", "sample"];
        const resolved = await adapter.resolveColumns(reserved);
        expect(resolved).toEqual({ columnIds: [], missing: reserved });
        await expect(
            adapter.fetchColumns({
                columnIds: ["sample"],
                sampleIds: ["001"],
            })
        ).rejects.toThrow('Column "sample" is excluded');
        expect(await adapter.listSampleIds()).toEqual(["001"]);
    });

    it("closes cancelled reads and allows a later attempt", async () => {
        const error = new DOMException("Cancelled metadata", "AbortError");
        figwig.getTracks
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce([track()]);
        const adapter = await createMetadataSourceAdapter({
            backend: { backend: "figwig", url: "signals.fw" },
        });
        await expect(adapter.listColumns()).rejects.toBe(error);
        expect(figwig.close).toHaveBeenCalledTimes(1);
        expect(await adapter.listSampleIds()).toEqual(["001"]);
        expect(figwig.opened).toHaveBeenCalledTimes(2);
        expect(figwig.close).toHaveBeenCalledTimes(2);
    });
});
