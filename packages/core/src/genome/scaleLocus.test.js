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
