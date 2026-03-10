import { afterEach, describe, expect, test, vi } from "vitest";
import GenomeStore from "./genomeStore.js";
import {
    collectAssembliesFromSpec,
    ensureAssembliesForSpec,
} from "./assemblyPreflight.js";

describe("assembly preflight", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("collects explicit assembly references from locus encodings", () => {
        const { assemblies, needsDefaultAssembly } = collectAssembliesFromSpec(
            /** @type {any} */ ({
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                type: "locus",
                                scale: { type: "locus", assembly: "hg19" },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                type: "locus",
                                scale: {
                                    type: "locus",
                                    assembly: {
                                        contigs: [{ name: "chrA", size: 10 }],
                                    },
                                },
                            },
                        },
                    },
                ],
            })
        );

        expect(needsDefaultAssembly).toBe(false);
        expect(assemblies[0]).toBe("hg19");
        expect(assemblies[1]).toEqual({
            contigs: [{ name: "chrA", size: 10 }],
        });
    });

    test("fails when locus scales need default assembly but none is configured", async () => {
        const store = new GenomeStore(".");

        await expect(() =>
            ensureAssembliesForSpec(
                /** @type {any} */ ({
                    mark: "point",
                    encoding: {
                        x: {
                            type: "locus",
                            scale: { type: "locus" },
                        },
                    },
                }),
                store
            )
        ).rejects.toThrow("No default assembly has been configured");
    });

    test("uses built-in root default assembly for locus scales without explicit assembly", async () => {
        const store = new GenomeStore(".");
        store.configureGenomes(new Map(), "hg19");

        await ensureAssembliesForSpec(
            /** @type {any} */ ({
                mark: "point",
                encoding: {
                    x: {
                        type: "locus",
                        scale: { type: "locus" },
                    },
                },
            }),
            store
        );

        expect(store.genomes.has("hg19")).toBe(true);
    });

    test("loads configured URL assembly once across repeated preflight calls", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            /** @type {any} */ ({
                ok: true,
                text: async () => "chr1\t10\n",
            })
        );

        const store = new GenomeStore("https://example.org/");
        store.configureGenomes(
            new Map([
                [
                    "custom",
                    {
                        url: "custom.chrom.sizes",
                    },
                ],
            ])
        );

        const childSpec = /** @type {any} */ ({
            mark: "point",
            encoding: {
                x: {
                    type: "locus",
                    scale: { type: "locus", assembly: "custom" },
                },
            },
        });

        // Non-obvious: this mirrors dynamic child insertion where multiple
        // subtree additions may reference the same assembly.
        await ensureAssembliesForSpec(childSpec, store);
        await ensureAssembliesForSpec(childSpec, store);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(store.getGenome("custom").getExtent()).toEqual([0, 10]);
    });
});
