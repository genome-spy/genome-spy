import { beforeEach, describe, expect, it, vi } from "vitest";
import ZarrMetadataSourceAdapter from "./zarrMetadataSourceAdapter.js";

/** @type {Record<string, any>} */
let mockArrays = {};

/**
 * @param {any[]} values
 */
function toChunk(values) {
    return {
        data: values,
        shape: [values.length],
        stride: [1],
    };
}

vi.mock("zarrita", () => ({
    FetchStore: class {
        constructor(url) {
            this.url = url;
        }
    },

    root: () => ({
        resolve: (path) => ({ path }),
    }),

    open: async (location) => ({
        path: location.path,
    }),

    slice: (start = null, stop = null, step = null) => ({
        start,
        stop,
        step,
    }),

    get: async (array, selection) => {
        if (!Array.isArray(selection) || selection.length === 0) {
            throw new Error("Mock expects explicit Zarr selection.");
        }

        if (array.path === "X") {
            const matrix = mockArrays.X;
            const columnIndex = selection[1];
            return toChunk(matrix.map((row) => row[columnIndex]));
        }

        return toChunk(mockArrays[array.path]);
    },
}));

describe("ZarrMetadataSourceAdapter", () => {
    beforeEach(() => {
        mockArrays = {
            X: [
                [1, 2],
                [3, 4],
            ],
            obs_names: ["s1", "s2"],
            var_names: ["ENSG1", "ENSG2"],
            "var/symbol": ["TP53", "MYC"],
            "var/ensembl_id": ["ENSG1.1", "ENSG2.3"],
            "var_synonyms/term": ["P53", "c-Myc"],
            "var_synonyms/column_index": [0, 1],
        };
    });

    it("lists columns and resolves queries using identifiers and synonyms", async () => {
        const adapter = new ZarrMetadataSourceAdapter({
            backend: {
                backend: "zarr",
                url: "https://example.org/expression.zarr",
                identifiers: [
                    {
                        name: "symbol",
                        path: "var/symbol",
                        primary: true,
                        caseInsensitive: true,
                    },
                    {
                        name: "ensembl",
                        path: "var/ensembl_id",
                        stripVersionSuffix: true,
                    },
                ],
                synonymIndex: {
                    termPath: "var_synonyms/term",
                    columnIndexPath: "var_synonyms/column_index",
                },
            },
        });

        const columns = await adapter.listColumns();
        expect(columns.map((column) => column.id)).toEqual(["ENSG1", "ENSG2"]);
        const sampleIds = await adapter.listSampleIds();
        expect(sampleIds).toEqual(["s1", "s2"]);

        const resolved = await adapter.resolveColumns([
            "TP53",
            "ENSG2",
            "ENSG1.1",
            "P53",
            "missing",
        ]);

        expect(resolved.columnIds).toEqual(["ENSG1", "ENSG2"]);
        expect(resolved.ambiguous).toEqual([]);
        expect(resolved.missing).toEqual(["missing"]);
    });

    it("fetches selected matrix columns and applies configured column defs", async () => {
        const adapter = new ZarrMetadataSourceAdapter({
            groupPath: "expression",
            attributes: {
                ENSG2: {
                    type: "quantitative",
                    scale: { domainMid: 0, scheme: "redblue" },
                },
            },
            backend: {
                backend: "zarr",
                url: "https://example.org/expression.zarr",
            },
        });

        const metadata = await adapter.fetchColumns({
            columnIds: ["ENSG2"],
            sampleIds: ["s2", "missing"],
            replace: true,
        });

        expect(metadata.columnarMetadata).toEqual({
            sample: ["s2"],
            "expression/ENSG2": [4],
        });
        expect(metadata.attributeDefs).toEqual({
            "expression/ENSG2": {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
        });
        expect(metadata.replace).toBe(true);
    });

    it('applies attributes[""] as source-level default for imported columns', async () => {
        const adapter = new ZarrMetadataSourceAdapter({
            groupPath: "expression",
            attributes: {
                "": {
                    type: "quantitative",
                    scale: { domainMid: 0, scheme: "redblue" },
                },
            },
            backend: {
                backend: "zarr",
                url: "https://example.org/expression.zarr",
            },
        });

        const metadata = await adapter.fetchColumns({
            columnIds: ["ENSG2"],
            sampleIds: ["s2"],
        });

        expect(metadata.attributeDefs).toEqual({
            expression: {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
        });
    });

    it("reports ambiguous query terms when lookup maps to multiple columns", async () => {
        mockArrays["var_synonyms/term"] = ["shared", "shared"];
        mockArrays["var_synonyms/column_index"] = [0, 1];

        const adapter = new ZarrMetadataSourceAdapter({
            backend: {
                backend: "zarr",
                url: "https://example.org/expression.zarr",
                synonymIndex: {
                    termPath: "var_synonyms/term",
                    columnIndexPath: "var_synonyms/column_index",
                },
            },
        });

        const resolved = await adapter.resolveColumns(["shared"]);
        expect(resolved.columnIds).toEqual([]);
        expect(resolved.ambiguous).toEqual(["shared"]);
        expect(resolved.missing).toEqual([]);
    });

    it("excludes configured columns from listing, lookup, and import", async () => {
        const adapter = new ZarrMetadataSourceAdapter({
            excludeColumns: ["ENSG2"],
            backend: {
                backend: "zarr",
                url: "https://example.org/expression.zarr",
                identifiers: [
                    {
                        name: "symbol",
                        path: "var/symbol",
                        primary: true,
                        caseInsensitive: true,
                    },
                ],
            },
        });

        const columns = await adapter.listColumns();
        expect(columns.map((column) => column.id)).toEqual(["ENSG1"]);

        const resolved = await adapter.resolveColumns([
            "MYC",
            "ENSG2",
            "ENSG1",
        ]);
        expect(resolved.columnIds).toEqual(["ENSG1"]);
        expect(resolved.missing).toEqual(["MYC", "ENSG2"]);
        expect(resolved.ambiguous).toEqual([]);

        await expect(
            adapter.fetchColumns({
                columnIds: ["ENSG2"],
                sampleIds: ["s1"],
            })
        ).rejects.toThrow(
            'Column "ENSG2" is excluded by metadata source configuration.'
        );
    });
});
