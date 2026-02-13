import { describe, expect, it } from "vitest";
import {
    createMetadataSourceAdapter,
    resolveMetadataSource,
} from "./metadataSourceAdapters.js";

describe("resolveMetadataSource", () => {
    it("resolves the only configured source when sourceId is omitted", () => {
        const source = {
            id: "clinical",
            backend: {
                backend: "data",
                data: { values: [{ sample: "s1", age: 1 }] },
            },
        };
        const sampleDef = { metadataSources: [source] };

        expect(resolveMetadataSource(sampleDef, undefined)).toBe(source);
    });

    it("throws when sourceId is omitted and multiple sources are configured", () => {
        const sampleDef = {
            metadataSources: [
                {
                    id: "a",
                    backend: {
                        backend: "data",
                        data: { values: [{ sample: "s1", a: 1 }] },
                    },
                },
                {
                    id: "b",
                    backend: {
                        backend: "data",
                        data: { values: [{ sample: "s1", b: 2 }] },
                    },
                },
            ],
        };

        expect(() => resolveMetadataSource(sampleDef, undefined)).toThrow(
            "Metadata source id is required when multiple sources are configured."
        );
    });

    it("throws when source entry is import-based", () => {
        const sampleDef = {
            metadataSources: [{ import: { url: "metadata/source.json" } }],
        };

        expect(() => resolveMetadataSource(sampleDef, undefined)).toThrow(
            "Imported metadata sources are not yet supported in metadata source actions."
        );
    });
});

describe("createMetadataSourceAdapter", () => {
    it("creates a data backend adapter", () => {
        const source = {
            backend: {
                backend: "data",
                data: { values: [{ sample: "s1", age: 1 }] },
            },
        };

        const adapter = createMetadataSourceAdapter(source);
        expect(adapter.constructor.name).toBe("DataMetadataSourceAdapter");
    });

    it("throws for unsupported backends", () => {
        const source = {
            backend: {
                backend: "zarr",
                url: "https://example.org/data.zarr",
                layout: "matrix",
            },
        };

        expect(() => createMetadataSourceAdapter(source)).toThrow(
            'Metadata backend "zarr" is not implemented yet.'
        );
    });
});
