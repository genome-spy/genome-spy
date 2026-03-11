// @ts-nocheck

import { describe, expect, test } from "vitest";

import { createTestViewContext } from "../view/testUtils.js";
import UnitView from "../view/unitView.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

describe("Scale resolution genome assembly", () => {
    test("locus scales can use explicit built-in assemblies without root genome config", async () => {
        const context = createTestViewContext();
        context.genomeStore.genomes.clear();

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: {
                values: [
                    {
                        hg19_chrom: "chr1",
                        hg19_start: 1,
                        hg38_chrom: "chr1",
                        hg38_start: 1,
                    },
                ],
            },
            mark: "point",
            encoding: {
                x: {
                    chrom: "hg19_chrom",
                    pos: "hg19_start",
                    type: "locus",
                    scale: { type: "locus", assembly: "hg19" },
                },
                y: {
                    chrom: "hg38_chrom",
                    pos: "hg38_start",
                    type: "locus",
                    scale: { type: "locus", assembly: "hg38" },
                },
            },
        };

        const view = await context.createOrImportView(spec, null, null, "root");
        if (!(view instanceof UnitView)) {
            throw new Error("Expected a unit view!");
        }

        expect(getRequiredScaleResolution(view, "x").getDomain()).toEqual(
            context.genomeStore.getGenome("hg19").getExtent()
        );
        expect(getRequiredScaleResolution(view, "y").getDomain()).toEqual(
            context.genomeStore.getGenome("hg38").getExtent()
        );
    });

    test("locus scales can use inline contigs in assembly definitions", async () => {
        const context = createTestViewContext();
        context.genomeStore.genomes.clear();

        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: {
                values: [
                    {
                        chrom: "chrA",
                        pos: 1,
                    },
                ],
            },
            mark: "point",
            encoding: {
                x: {
                    chrom: "chrom",
                    pos: "pos",
                    type: "locus",
                    scale: {
                        type: "locus",
                        assembly: {
                            contigs: [
                                { name: "chrA", size: 5 },
                                { name: "chrB", size: 7 },
                            ],
                        },
                    },
                },
            },
        };

        const view = await context.createOrImportView(spec, null, null, "root");
        if (!(view instanceof UnitView)) {
            throw new Error("Expected a unit view!");
        }

        expect(getRequiredScaleResolution(view, "x").getDomain()).toEqual([
            0, 12,
        ]);
    });

    test("inline assembly urls resolve against member view baseUrl", async () => {
        const context = createTestViewContext();
        const view = await context.createOrImportView(
            /** @type {any} */ ({
                baseUrl: "https://example.org/specs/",
                data: {
                    values: [{ chrom: "chr1", pos: 1 }],
                },
                mark: "point",
                encoding: {
                    x: {
                        chrom: "chrom",
                        pos: "pos",
                        type: "locus",
                        scale: {
                            type: "locus",
                            assembly: {
                                url: "relative.chrom.sizes",
                            },
                        },
                    },
                },
            }),
            null,
            null,
            "root"
        );

        expect(
            getRequiredScaleResolution(view, "x").getAssemblyRequirement()
        ).toEqual({
            assembly: {
                url: "https://example.org/specs/relative.chrom.sizes",
            },
            needsDefaultAssembly: false,
        });
    });
});
