// @ts-check
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import TableMetadataSourceAdapter from "./tableMetadataSourceAdapter.js";
import { createMetadataSourceAdapter } from "../metadataSourceAdapters.js";
import { bootstrapInitialMetadataSources } from "../metadataSourceBootstrap.js";
import { sampleSlice } from "../../state/sampleSlice.js";

const figwig = vi.hoisted(() => ({
    opened: vi.fn(),
    getTracks: vi.fn(),
    close: vi.fn(),
}));

vi.mock("@genome-spy/figwig", () => ({
    FigWig: class {
        /** @param {unknown} options */
        constructor(options) {
            figwig.opened(options);
        }

        getTracks = figwig.getTracks;
        close = figwig.close;
    },
}));

/**
 * @returns {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef}
 */
function createSourceDef() {
    return {
        id: "clinical",
        backend: {
            backend: "data",
            data: {
                values: [
                    { sample: "s1", TP53: 2.1, status: "A" },
                    { sample: "s2", TP53: -0.4, status: "B" },
                ],
            },
            sampleIdField: "sample",
        },
        attributes: {
            TP53: {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
            status: {
                type: "nominal",
            },
        },
    };
}

describe("TableMetadataSourceAdapter", () => {
    it("lists and resolves columns from inline data", async () => {
        const adapter = new TableMetadataSourceAdapter(createSourceDef());

        const columns = await adapter.listColumns();
        expect(columns.map((column) => column.id)).toEqual(["TP53", "status"]);
        const sampleIds = await adapter.listSampleIds();
        expect(sampleIds).toEqual(["s1", "s2"]);

        const resolved = await adapter.resolveColumns([
            "status",
            "TP53",
            "status",
            "missing",
        ]);
        expect(resolved.columnIds).toEqual(["status", "TP53"]);
        expect(resolved.missing).toEqual(["missing"]);
    });

    it("fetches selected columns and applies configured attribute defs", async () => {
        const adapter = new TableMetadataSourceAdapter(createSourceDef());

        const metadata = await adapter.fetchColumns({
            columnIds: ["TP53", "status"],
            sampleIds: ["s1", "s3"],
            groupPath: "expression",
            replace: true,
        });

        expect(metadata.columnarMetadata).toEqual({
            sample: ["s1"],
            "expression/TP53": [2.1],
            "expression/status": ["A"],
        });

        expect(metadata.attributeDefs).toEqual({
            "expression/TP53": {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
            "expression/status": {
                type: "nominal",
            },
        });
        expect(metadata.replace).toBe(true);
    });

    it("fails when source rows do not match any sample ids", async () => {
        const adapter = new TableMetadataSourceAdapter(createSourceDef());

        await expect(
            adapter.fetchColumns({
                columnIds: ["TP53"],
                sampleIds: ["missing-sample"],
            })
        ).rejects.toThrow(
            "Metadata source rows do not match any sample ids in the current view."
        );
    });

    it("preserves source column order when listing columns", async () => {
        const adapter = new TableMetadataSourceAdapter({
            backend: {
                backend: "data",
                data: {
                    values: [
                        { sample: "s1", status: "A", TP53: 2.1 },
                        { sample: "s2", TP53: -0.4, purity: 0.8 },
                    ],
                },
                sampleIdField: "sample",
            },
        });

        const columns = await adapter.listColumns();
        expect(columns.map((column) => column.id)).toEqual([
            "status",
            "TP53",
            "purity",
        ]);
    });

    it("lists stable sampled column examples for agent context", async () => {
        const adapter = new TableMetadataSourceAdapter({
            backend: {
                backend: "data",
                data: {
                    values: [
                        {
                            sample: "s1",
                            TP53: 1,
                            MYC: 2,
                            EGFR: 3,
                            PTEN: 4,
                            KRAS: 5,
                        },
                    ],
                },
                sampleIdField: "sample",
            },
        });

        const examples = await adapter.listIdentifierExamples(2);
        const secondExamples = await adapter.listIdentifierExamples(2);

        expect(secondExamples).toEqual(examples);
        expect(examples).toEqual([
            {
                name: "column",
                primary: true,
                examples: expect.any(Array),
            },
        ]);
        expect(examples[0].examples).toHaveLength(2);
        expect(examples[0].examples).not.toEqual(["TP53", "MYC"]);
    });

    it("excludes configured columns from listing and importing", async () => {
        const adapter = new TableMetadataSourceAdapter({
            ...createSourceDef(),
            excludeColumns: ["status"],
        });

        const columns = await adapter.listColumns();
        expect(columns.map((column) => column.id)).toEqual(["TP53"]);

        const resolved = await adapter.resolveColumns(["status", "TP53"]);
        expect(resolved.columnIds).toEqual(["TP53"]);
        expect(resolved.missing).toEqual(["status"]);

        await expect(
            adapter.fetchColumns({
                columnIds: ["status"],
                sampleIds: ["s1"],
            })
        ).rejects.toThrow(
            'Column "status" is excluded by metadata source configuration.'
        );
    });

    it("excludes sampleIdField from imported metadata implicitly", async () => {
        const adapter = new TableMetadataSourceAdapter({
            backend: {
                backend: "data",
                data: {
                    values: [
                        { sid: "s1", displayName: "Sample 1", purity: 0.8 },
                        { sid: "s2", displayName: "Sample 2", purity: 0.6 },
                    ],
                },
                sampleIdField: "sid",
            },
            excludeColumns: ["displayName"],
        });

        const columns = await adapter.listColumns();
        expect(columns.map((column) => column.id)).toEqual(["purity"]);

        const resolved = await adapter.resolveColumns(["sid", "purity"]);
        expect(resolved.columnIds).toEqual(["purity"]);
        expect(resolved.missing).toEqual(["sid"]);

        await expect(
            adapter.fetchColumns({
                columnIds: ["sid"],
                sampleIds: ["s1"],
            })
        ).rejects.toThrow(
            'Column "sid" is excluded by metadata source configuration.'
        );
    });

    it("applies hierarchy-aware column defs with attributeGroupSeparator", async () => {
        const adapter = new TableMetadataSourceAdapter({
            id: "clinical",
            attributeGroupSeparator: ".",
            attributes: {
                patientId: {
                    type: "nominal",
                },
                clinical: {
                    type: "quantitative",
                    scale: { scheme: "blues" },
                },
                "clinical.OS": {
                    visible: false,
                },
                signature: {
                    type: "quantitative",
                    scale: { scheme: "yelloworangered" },
                    visible: false,
                },
            },
            backend: {
                backend: "data",
                data: {
                    values: [
                        {
                            sample: "s1",
                            patientId: "p1",
                            "clinical.PFI": 10,
                            "clinical.OS": 5,
                            "signature.HRD": 1.3,
                        },
                        {
                            sample: "s2",
                            patientId: "p2",
                            "clinical.PFI": 20,
                            "clinical.OS": 8,
                            "signature.HRD": 0.7,
                        },
                    ],
                },
                sampleIdField: "sample",
            },
        });

        const metadata = await adapter.fetchColumns({
            columnIds: ["clinical.PFI", "clinical.OS", "signature.HRD"],
            sampleIds: ["s1", "s2"],
        });

        expect(metadata.columnarMetadata).toEqual({
            sample: ["s1", "s2"],
            "clinical/PFI": [10, 20],
            "clinical/OS": [5, 8],
            "signature/HRD": [1.3, 0.7],
        });
        expect(metadata.attributeDefs).toEqual({
            clinical: {
                type: "quantitative",
                scale: { scheme: "blues" },
            },
            "clinical/OS": {
                visible: false,
            },
            signature: {
                type: "quantitative",
                scale: { scheme: "yelloworangered" },
                visible: false,
            },
        });
    });

    it('applies attributes[""] as source-level default for flat columns', async () => {
        const adapter = new TableMetadataSourceAdapter({
            id: "expression",
            attributes: {
                "": {
                    type: "quantitative",
                    scale: { domainMid: 0, scheme: "redblue" },
                },
                status: {
                    type: "nominal",
                },
            },
            backend: {
                backend: "data",
                data: {
                    values: [
                        { sample: "s1", TP53: 1.2, status: "A" },
                        { sample: "s2", TP53: -0.2, status: "B" },
                    ],
                },
                sampleIdField: "sample",
            },
        });

        const metadata = await adapter.fetchColumns({
            columnIds: ["TP53", "status"],
            sampleIds: ["s1", "s2"],
        });

        expect(metadata.attributeDefs).toEqual({
            TP53: {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
            status: {
                type: "nominal",
            },
        });
    });

    it('maps attributes[""] to groupPath when imported under a group', async () => {
        const adapter = new TableMetadataSourceAdapter({
            id: "expression",
            groupPath: "Expression",
            attributes: {
                "": {
                    type: "quantitative",
                    scale: { domainMid: 0, scheme: "redblue" },
                },
            },
            backend: {
                backend: "data",
                data: {
                    values: [{ sample: "s1", TP53: 1.2 }],
                },
                sampleIdField: "sample",
            },
        });

        const metadata = await adapter.fetchColumns({
            columnIds: ["TP53"],
            sampleIds: ["s1"],
        });

        expect(metadata.attributeDefs).toEqual({
            Expression: {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
        });
    });
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

    it("routes a Figwig backend through the shared table pipeline and caches one metadata read", async () => {
        const metadataTrack = track({
            name: "metadata cannot replace track identity",
        });
        figwig.getTracks.mockResolvedValue([metadataTrack]);
        const adapter = createMetadataSourceAdapter(
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
        const adapter = createMetadataSourceAdapter({
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
        const adapter = createMetadataSourceAdapter({
            backend: { backend: "figwig", url: "signals.fw" },
        });
        await expect(adapter.listColumns()).rejects.toBe(error);
        expect(figwig.close).toHaveBeenCalledTimes(1);
        expect(await adapter.listSampleIds()).toEqual(["001"]);
        expect(figwig.opened).toHaveBeenCalledTimes(2);
        expect(figwig.close).toHaveBeenCalledTimes(2);
    });
});
