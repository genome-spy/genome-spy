import { afterEach, describe, expect, test, vi } from "vitest";
import GenomeStore from "./genomeStore.js";

describe("GenomeStore", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("returns configured default assembly when multiple genomes exist", async () => {
        const store = new GenomeStore(".");
        store.configureGenomes(
            new Map([
                [
                    "a",
                    {
                        contigs: [{ name: "chr1", size: 10 }],
                    },
                ],
                [
                    "b",
                    {
                        contigs: [{ name: "chr1", size: 20 }],
                    },
                ],
            ]),
            "b"
        );

        await store.ensureAssemblies(["a", "b"]);

        expect(store.getGenome().name).toBe("b");
    });

    test("allows built-in default assembly even when genomes map is empty", () => {
        const store = new GenomeStore(".");
        store.configureGenomes(new Map(), "hg19");

        expect(store.getGenome().name).toBe("hg19");
    });

    test("throws if configured genome is requested before loading", () => {
        const store = new GenomeStore(".");
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

        expect(() => store.getGenome("custom")).toThrow(
            'Genome custom has not been loaded yet. Call ensureAssembly("custom") before accessing it.'
        );
    });

    test("deduplicates concurrent URL assembly loads", async () => {
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

        await Promise.all([
            store.ensureAssembly("custom"),
            store.ensureAssembly("custom"),
        ]);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("deduplicates concurrent inline URL assembly loads", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            /** @type {any} */ ({
                ok: true,
                text: async () => "chr1\t10\n",
            })
        );

        const store = new GenomeStore("https://example.org/base/");
        const inlineAssembly = /** @type {const} */ ({
            url: "inline.chrom.sizes",
        });

        await Promise.all([
            store.ensureAssembly(inlineAssembly),
            store.ensureAssembly(inlineAssembly),
        ]);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(store.getGenome(inlineAssembly).getExtent()).toEqual([0, 10]);
    });

    test("throws when inline URL assembly is accessed before loading", () => {
        const store = new GenomeStore(".");
        expect(() =>
            store.getGenome(
                /** @type {import("../spec/scale.js").InlineLocusAssembly} */ ({
                    url: "inline.chrom.sizes",
                })
            )
        ).toThrow("Inline URL assemblies must be loaded first.");
    });

    test("rejects inline assemblies that define both contigs and url", async () => {
        const store = new GenomeStore(".");
        await expect(() =>
            store.ensureAssembly(
                /** @type {any} */ ({
                    contigs: [{ name: "chr1", size: 10 }],
                    url: "inline.chrom.sizes",
                })
            )
        ).rejects.toThrow("must define exactly one of `contigs` or `url`");
    });
});
