import { describe, expect, test } from "vitest";
import { resolveRootGenomeConfig } from "./rootGenomeConfig.js";

describe("resolveRootGenomeConfig", () => {
    test("resolves legacy root genome and emits deprecation warning", () => {
        const resolved = resolveRootGenomeConfig({
            genome: {
                name: "hg38",
            },
        });

        expect(resolved.defaultAssembly).toBe("hg38");
        expect(resolved.genomesByName.size).toBe(0);
        expect(resolved.deprecationWarning).toContain("deprecated");
        expect(resolved.deprecationWarning).toContain("genomes");
        expect(resolved.deprecationWarning).toContain("assembly");
        expect(resolved.deprecationWarning).toContain(
            '{"genome":{"name":"hg38"}} -> {"assembly":"hg38"}'
        );
    });

    test("keeps legacy custom genome definitions in the configured map", () => {
        const resolved = resolveRootGenomeConfig({
            genome: {
                name: "custom",
                contigs: [{ name: "chr1", size: 10 }],
            },
        });

        expect(resolved.defaultAssembly).toBe("custom");
        expect(resolved.genomesByName.get("custom")).toEqual({
            contigs: [{ name: "chr1", size: 10 }],
        });
    });

    test("rejects mixed legacy and new root genome properties", () => {
        expect(() =>
            resolveRootGenomeConfig({
                genome: { name: "hg38" },
                genomes: { hg19: {} },
            })
        ).toThrow("Do not mix deprecated `genome` with `genomes`.");
    });

    test("rejects legacy genome mixed with root assembly", () => {
        expect(() =>
            resolveRootGenomeConfig({
                genome: { name: "hg38" },
                assembly: "hg38",
            })
        ).toThrow("Do not mix deprecated `genome` with root `assembly`.");
    });

    test("defaults assembly to the only configured genome", () => {
        const resolved = resolveRootGenomeConfig({
            genomes: {
                custom: {
                    contigs: [{ name: "chr1", size: 10 }],
                },
            },
        });

        expect(resolved.defaultAssembly).toBe("custom");
        expect(resolved.genomesByName.get("custom")).toEqual({
            contigs: [{ name: "chr1", size: 10 }],
        });
    });

    test("accepts built-in root assembly even when not in genomes map", () => {
        const resolved = resolveRootGenomeConfig({
            genomes: {
                custom: {
                    contigs: [{ name: "chr1", size: 10 }],
                },
            },
            assembly: "hg19",
        });

        expect(resolved.defaultAssembly).toBe("hg19");
    });

    test("rejects unknown root assembly", () => {
        expect(() =>
            resolveRootGenomeConfig({
                assembly: "unknown_assembly",
            })
        ).toThrow("neither defined in `genomes` nor a built-in assembly");
    });
});
