// @ts-check
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createMetadataSourceAdapter,
    resolveMetadataSources,
    resolveMetadataSource,
} from "./metadataSourceAdapters.js";

const createMetadataSourceAdapterAny = /** @type {any} */ (
    createMetadataSourceAdapter
);
const resolveMetadataSourceAny = /** @type {any} */ (resolveMetadataSource);
const resolveMetadataSourcesAny = /** @type {any} */ (resolveMetadataSources);

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

        await expect(
            resolveMetadataSourceAny(sampleDef, undefined)
        ).resolves.toBe(source);
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
            resolveMetadataSourceAny(sampleDef, undefined)
        ).rejects.toThrow(
            "Metadata source id is required when multiple sources are configured."
        );
    });

    it("resolves imported metadata sources", async () => {
        const sampleDef = {
            metadataSources: [{ import: { url: "metadata/source.json" } }],
        };

        await expect(
            resolveMetadataSourceAny(sampleDef, undefined, {
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
            resolveMetadataSourcesAny(sampleDef, {
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
            resolveMetadataSourcesAny(sampleDef, {
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
            resolveMetadataSourcesAny(sampleDef, {
                loadJson: async () => ({
                    import: { url: "nested.json" },
                }),
            })
        ).rejects.toThrow("Nested metadata source imports are not supported");
    });

    it('rejects removed "columnDefs" property', async () => {
        const sampleDef = {
            metadataSources: [
                {
                    id: "clinical",
                    columnDefs: {
                        TP53: { type: "quantitative" },
                    },
                    backend: {
                        backend: "data",
                        data: { values: [{ sample: "s1", TP53: 1 }] },
                    },
                },
            ],
        };

        await expect(resolveMetadataSourcesAny(sampleDef)).rejects.toThrow(
            'uses removed property "columnDefs". Use "attributes" instead.'
        );
    });

    it('rejects removed "backend.synonymIndex" property', async () => {
        const sampleDef = {
            metadataSources: [
                {
                    id: "expression",
                    backend: {
                        backend: "zarr",
                        url: "https://example.org/expression.zarr",
                        synonymIndex: {
                            termPath: "var_synonyms/term",
                            columnIndexPath: "var_synonyms/column_index",
                        },
                    },
                },
            ],
        };

        await expect(resolveMetadataSourcesAny(sampleDef)).rejects.toThrow(
            'uses removed property "backend.synonymIndex". Use "backend.identifiers" instead.'
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

        const adapter = createMetadataSourceAdapterAny(source);
        expect(adapter.constructor.name).toBe("DataMetadataSourceAdapter");
    });

    it("creates a zarr backend adapter", () => {
        const source = {
            backend: {
                backend: "zarr",
                url: "https://example.org/data.zarr",
            },
        };

        const adapter = createMetadataSourceAdapterAny(source);
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

        expect(() => createMetadataSourceAdapterAny(source)).toThrow(
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
            },
        };

        const adapter = createMetadataSourceAdapterAny(source);
        expect(adapter.constructor.name).toBe("ZarrMetadataSourceAdapter");
    });
});
