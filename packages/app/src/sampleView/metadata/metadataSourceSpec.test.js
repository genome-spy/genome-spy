import { describe, expect, it } from "vitest";
import { normalizeSampleDefMetadataSources } from "./metadataSourceSpec.js";

describe("normalizeSampleDefMetadataSources", () => {
    it("maps legacy metadata fields to an implicit data backend source", () => {
        const sampleDef = {
            data: { url: "samples.tsv" },
            attributeGroupSeparator: ".",
            attributes: {
                clinical: { type: "quantitative" },
            },
        };

        const normalized = normalizeSampleDefMetadataSources(sampleDef);

        expect(normalized.usesLegacyMetadata).toBe(true);
        expect(normalized.sampleDef.metadataSources).toEqual([
            {
                initialLoad: "*",
                attributeGroupSeparator: ".",
                columnDefs: {
                    clinical: { type: "quantitative" },
                },
                backend: {
                    backend: "data",
                    data: { url: "samples.tsv" },
                    sampleIdField: "sample",
                },
            },
        ]);
    });

    it("does not inject an implicit source when metadataSources already exist", () => {
        const sampleDef = {
            data: { url: "samples.tsv" },
            metadataSources: [
                {
                    id: "source",
                    backend: {
                        backend: "data",
                        data: { url: "metadata.tsv" },
                    },
                },
            ],
        };

        const normalized = normalizeSampleDefMetadataSources(sampleDef);
        expect(normalized.sampleDef).toBe(sampleDef);
        expect(normalized.usesLegacyMetadata).toBe(true);
    });

    it("returns the original object for non-legacy sample defs", () => {
        const sampleDef = {
            metadataSources: [
                {
                    id: "source",
                    backend: {
                        backend: "zarr",
                        url: "https://example.org/expression.zarr",
                        layout: "matrix",
                    },
                },
            ],
        };

        const normalized = normalizeSampleDefMetadataSources(sampleDef);
        expect(normalized.sampleDef).toBe(sampleDef);
        expect(normalized.usesLegacyMetadata).toBe(false);
    });
});
