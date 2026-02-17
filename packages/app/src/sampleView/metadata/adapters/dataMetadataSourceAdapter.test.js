import { describe, expect, it } from "vitest";
import DataMetadataSourceAdapter from "./dataMetadataSourceAdapter.js";

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

describe("DataMetadataSourceAdapter", () => {
    it("lists and resolves columns from inline data", async () => {
        const adapter = new DataMetadataSourceAdapter(createSourceDef());

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
        const adapter = new DataMetadataSourceAdapter(createSourceDef());

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
        const adapter = new DataMetadataSourceAdapter(createSourceDef());

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
        const adapter = new DataMetadataSourceAdapter({
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

    it("excludes configured columns from listing and importing", async () => {
        const adapter = new DataMetadataSourceAdapter({
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

    it("applies hierarchy-aware column defs with attributeGroupSeparator", async () => {
        const adapter = new DataMetadataSourceAdapter({
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
        const adapter = new DataMetadataSourceAdapter({
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
        const adapter = new DataMetadataSourceAdapter({
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
