import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createMetadataSourceAdapter,
    resolveMetadataSources,
    resolveMetadataSource,
} from "./metadataSourceAdapters.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("resolveMetadataSource", () => {
    it("resolves the only configured source when sourceId is omitted", async () => {
        const source = {
            id: "clinical",
            backend: {
                backend: "data",
                data: { values: [{ sample: "s1", age: 1 }] },
            },
        };
        const sampleDef = { metadataSources: [source] };

        await expect(resolveMetadataSource(sampleDef, undefined)).resolves.toBe(
            source
        );
    });

    it("throws when sourceId is omitted and multiple sources are configured", async () => {
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

        await expect(
            resolveMetadataSource(sampleDef, undefined)
        ).rejects.toThrow(
            "Metadata source id is required when multiple sources are configured."
        );
    });

    it("resolves imported metadata sources", async () => {
        const sampleDef = {
            metadataSources: [{ import: { url: "metadata/source.json" } }],
        };

        await expect(
            resolveMetadataSource(sampleDef, undefined, {
                baseUrl: "https://example.org/spec/",
                loadJson: async (url) => ({
                    id: "clinical",
                    backend: {
                        backend: "data",
                        data: {
                            url,
                        },
                        sampleIdField: "sample",
                    },
                }),
            })
        ).resolves.toMatchObject({
            id: "clinical",
            backend: {
                data: {
                    url: "https://example.org/spec/metadata/source.json",
                },
            },
        });
    });
});

describe("resolveMetadataSources", () => {
    it("rewrites imported backend urls relative to the import file", async () => {
        const sampleDef = {
            metadataSources: [{ import: { url: "metadata/source.json" } }],
        };

        await expect(
            resolveMetadataSources(sampleDef, {
                baseUrl: "https://example.org/spec/",
                loadJson: async () => ({
                    id: "clinical",
                    backend: {
                        backend: "data",
                        data: {
                            url: "../data/samples.tsv",
                        },
                        sampleIdField: "sample",
                    },
                }),
            })
        ).resolves.toMatchObject([
            {
                backend: {
                    data: {
                        url: "https://example.org/spec/data/samples.tsv",
                    },
                },
            },
        ]);
    });

    it("resolves imported backend urls correctly when baseUrl is relative", async () => {
        vi.stubGlobal(
            "window",
            /** @type {Window & typeof globalThis} */ (
                /** @type {unknown} */ ({
                    location: {
                        href: "https://host.example/app/index.html",
                    },
                })
            )
        );

        const sampleDef = {
            metadataSources: [{ import: { url: "metadata/source.json" } }],
        };

        await expect(
            resolveMetadataSources(sampleDef, {
                baseUrl: "private/decider_set2-19/",
                loadJson: async () => ({
                    id: "clinical",
                    backend: {
                        backend: "data",
                        data: {
                            url: "../data/samples.tsv",
                        },
                        sampleIdField: "sample",
                    },
                }),
            })
        ).resolves.toMatchObject([
            {
                backend: {
                    data: {
                        url: "https://host.example/app/private/decider_set2-19/data/samples.tsv",
                    },
                },
            },
        ]);
    });

    it("rejects nested imports", async () => {
        const sampleDef = {
            metadataSources: [{ import: { url: "metadata/source.json" } }],
        };

        await expect(
            resolveMetadataSources(sampleDef, {
                loadJson: async () => ({
                    import: { url: "nested.json" },
                }),
            })
        ).rejects.toThrow("Nested metadata source imports are not supported");
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

    it("creates a zarr backend adapter", () => {
        const source = {
            backend: {
                backend: "zarr",
                url: "https://example.org/data.zarr",
                layout: "matrix",
            },
        };

        const adapter = createMetadataSourceAdapter(source);
        expect(adapter.constructor.name).toBe("ZarrMetadataSourceAdapter");
    });

    it("throws for unsupported backends", () => {
        const source = {
            backend: {
                backend: "parquet",
                url: "https://example.org/data.parquet",
                sampleIdField: "sample",
            },
        };

        expect(() => createMetadataSourceAdapter(source)).toThrow(
            'Metadata backend "parquet" is not implemented yet.'
        );
    });

    it("ignores defaultAttributeDef for compatibility", () => {
        const source = {
            id: "expression",
            defaultAttributeDef: {
                type: "quantitative",
            },
            backend: {
                backend: "zarr",
                url: "https://example.org/data.zarr",
                layout: "matrix",
            },
        };

        const adapter = createMetadataSourceAdapter(source);
        expect(adapter.constructor.name).toBe("ZarrMetadataSourceAdapter");
    });
});
