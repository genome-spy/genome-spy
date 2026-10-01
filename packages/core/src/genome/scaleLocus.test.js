import { describe, expect, test } from "vitest";

import Genome from "./genome.js";
import {
    fromComplexInterval,
    fromComplexValue,
    getGenomeExtent,
    toComplexInterval,
    toComplexValue,
} from "./scaleLocus.js";
import scaleLocus from "./scaleLocus.js";

describe("scaleLocus helpers", () => {
    const genome = new Genome({
        name: "test",
        contigs: [
            { name: "chr1", size: 100 },
            { name: "chr2", size: 50 },
        ],
    });
    const scale = scaleLocus().genome(genome);
    const emptyScale = scaleLocus();

    test("toComplexValue maps continuous coordinates to chromosomal locus", () => {
        expect(toComplexValue(scale, 20)).toEqual({ chrom: "chr1", pos: 20 });
        expect(toComplexValue(emptyScale, 20)).toBe(20);
    });

    test("fromComplexValue maps chromosomal locus to continuous coordinates", () => {
        expect(fromComplexValue(scale, { chrom: "chr1", pos: 20 })).toBe(20);
        expect(fromComplexValue(emptyScale, 20)).toBe(20);
    });

    test("fromComplexInterval maps chromosomal intervals to continuous", () => {
        const interval = [
            { chrom: "chr1", pos: 10 },
            { chrom: "chr2", pos: 5 },
        ];
        expect(fromComplexInterval(scale, interval)).toEqual([10, 105]);
    });

    test("toComplexInterval maps continuous interval to chromosomal coordinates", () => {
        const interval = [10, 105];
        expect(toComplexInterval(scale, interval)).toEqual([
            { chrom: "chr1", pos: 10 },
            { chrom: "chr2", pos: 5 },
        ]);
    });

    test("getGenomeExtent uses the bound genome", () => {
        expect(getGenomeExtent(scale)).toEqual([0, 150]);
    });
});

describe("scaleLocus ticks", () => {
    /**
     * @param {number} chromosomeSize
     * @param {number[]} domain
     */
    function createScale(chromosomeSize, domain) {
        return scaleLocus()
            .genome(
                new Genome({
                    name: "test",
                    contigs: [{ name: "chr1", size: chromosomeSize }],
                })
            )
            .domain(domain);
    }

    test("returns every base when the requested tick count allows it", () => {
        const scale = createScale(1_000, [100, 110]);
        const ticks = scale.ticks(100);

        expect(ticks.map(scale.tickFormat(100))).toEqual([
            "101",
            "102",
            "103",
            "104",
            "105",
            "106",
            "107",
            "108",
            "109",
            "110",
        ]);
    });

    test("thins exact labels when the requested count limits density", () => {
        const scale = createScale(200_000_000, [100_000_000, 100_100_000]);
        const ticks = scale.ticks(10);

        expect(ticks.length).toBeLessThan(10);
        expect(scale.tickFormat(10)(ticks[0])).toContain(",");
    });

    test("keeps abbreviated labels for large spans", () => {
        const scale = createScale(200_000_000, [0, 200_000_000]);
        const tick = scale.ticks(7)[0];

        expect(scale.tickFormat(7)(tick)).toContain("M");
    });

    test("keeps one-base spacing as fractional spans expose more bases", () => {
        const scale = createScale(20_000_000, [16_814_352, 16_814_354]);
        expect(scale.ticks(10)).toEqual([16_814_352, 16_814_353]);

        // Newly exposed bases add edge ticks without changing the existing spacing.
        for (const end of [16_814_354.01, 16_814_354.9]) {
            scale.domain([16_814_352, end]);
            expect(scale.ticks(10)).toEqual([
                16_814_352, 16_814_353, 16_814_354,
            ]);
        }
    });
});
