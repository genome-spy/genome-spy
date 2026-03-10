import { afterEach, describe, expect, test, vi } from "vitest";
import { createTestViewContext } from "../view/testUtils.js";
import { markViewAsNonAddressable } from "../view/viewSelectors.js";
import {
    collectAssembliesFromViewHierarchy,
    ensureAssembliesForView,
} from "./assemblyPreflight.js";

describe("assembly preflight", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("collects assembly references from a resolved view hierarchy", async () => {
        const context = createTestViewContext();
        const view = await context.createOrImportView(
            /** @type {any} */ ({
                data: {
                    values: [{ chrom: "chr1", pos: 1 }],
                },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                chrom: "chrom",
                                pos: "pos",
                                type: "locus",
                                scale: { type: "locus", assembly: "hg19" },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                chrom: "chrom",
                                pos: "pos",
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
            }),
            null,
            null,
            "root"
        );
        const { assemblies, needsDefaultAssembly } =
            collectAssembliesFromViewHierarchy(view);

        expect(needsDefaultAssembly).toBe(false);
        expect(assemblies).toContain("hg19");
        expect(assemblies).toContainEqual({
            contigs: [{ name: "chrA", size: 10 }],
        });
    });

    test("ignores internal non-addressable locus views when checking defaults", async () => {
        const context = createTestViewContext();
        const view = await context.createOrImportView(
            /** @type {any} */ ({
                data: {
                    values: [{ chrom: "chr1", pos: 1 }],
                },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                chrom: "chrom",
                                pos: "pos",
                                type: "locus",
                                scale: { type: "locus" },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                chrom: "chrom",
                                pos: "pos",
                                type: "locus",
                                scale: { type: "locus", assembly: "hg19" },
                            },
                        },
                    },
                ],
            }),
            null,
            null,
            "root"
        );

        // Non-obvious: this simulates a generated helper view (e.g. axis/grid)
        // that should not influence assembly requirements.
        const descendants = view.getDescendants();
        const internalLocusView = descendants[1];
        if (!internalLocusView) {
            throw new Error("Expected child view was not created.");
        }
        markViewAsNonAddressable(internalLocusView, { skipSubtree: true });

        const { assemblies, needsDefaultAssembly } =
            collectAssembliesFromViewHierarchy(view);

        expect(needsDefaultAssembly).toBe(false);
        expect(assemblies).toEqual(["hg19"]);
    });

    test("fails when locus scales need default assembly but none is configured", async () => {
        const context = createTestViewContext();
        context.genomeStore.configureGenomes(new Map());
        const view = await context.createOrImportView(
            /** @type {any} */ ({
                data: {
                    values: [{ chrom: "chr1", pos: 1 }],
                },
                mark: "point",
                encoding: {
                    x: {
                        chrom: "chrom",
                        pos: "pos",
                        type: "locus",
                        scale: { type: "locus" },
                    },
                },
            }),
            null,
            null,
            "root"
        );

        await expect(() =>
            ensureAssembliesForView(view, context.genomeStore)
        ).rejects.toThrow("No default assembly has been configured");
    });

    test("uses built-in root default assembly for locus scales without explicit assembly", async () => {
        const context = createTestViewContext();
        context.genomeStore.configureGenomes(new Map(), "hg19");
        const view = await context.createOrImportView(
            /** @type {any} */ ({
                data: {
                    values: [{ chrom: "chr1", pos: 1 }],
                },
                mark: "point",
                encoding: {
                    x: {
                        chrom: "chrom",
                        pos: "pos",
                        type: "locus",
                        scale: { type: "locus" },
                    },
                },
            }),
            null,
            null,
            "root"
        );

        await ensureAssembliesForView(view, context.genomeStore);

        expect(context.genomeStore.genomes.has("hg19")).toBe(true);
    });

    test("loads configured URL assembly once across repeated preflight calls", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            /** @type {any} */ ({
                ok: true,
                text: async () => "chr1\t10\n",
            })
        );

        const context = createTestViewContext();
        context.genomeStore.baseUrl = "https://example.org/";
        context.genomeStore.configureGenomes(
            new Map([
                [
                    "custom",
                    {
                        url: "custom.chrom.sizes",
                    },
                ],
            ])
        );

        const view = await context.createOrImportView(
            /** @type {any} */ ({
                data: {
                    values: [{ chrom: "chr1", pos: 1 }],
                },
                mark: "point",
                encoding: {
                    x: {
                        chrom: "chrom",
                        pos: "pos",
                        type: "locus",
                        scale: { type: "locus", assembly: "custom" },
                    },
                },
            }),
            null,
            null,
            "root"
        );

        // Non-obvious: this mirrors dynamic child insertion where multiple
        // subtree additions may reference the same assembly.
        await ensureAssembliesForView(view, context.genomeStore);
        await ensureAssembliesForView(view, context.genomeStore);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(context.genomeStore.getGenome("custom").getExtent()).toEqual([
            0, 10,
        ]);
    });
});
