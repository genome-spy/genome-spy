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
});
