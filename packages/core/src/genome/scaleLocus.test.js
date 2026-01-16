import { describe, expect, test } from "vitest";

import Genome from "./genome.js";
import {
    fromComplexInterval,
    fromComplexValue,
    toComplexValue,
} from "./scaleLocus.js";

describe("scaleLocus helpers", () => {
    const genome = new Genome({
        name: "test",
        contigs: [
            { name: "chr1", size: 100 },
            { name: "chr2", size: 50 },
        ],
    });

    test("toComplexValue maps continuous coordinates to chromosomal locus", () => {
        expect(toComplexValue(genome, 20)).toEqual({ chrom: "chr1", pos: 20 });
        expect(toComplexValue(undefined, 20)).toBe(20);
    });

    test("fromComplexValue maps chromosomal locus to continuous coordinates", () => {
        expect(fromComplexValue(genome, { chrom: "chr1", pos: 20 })).toBe(20);
        expect(fromComplexValue(undefined, 20)).toBe(20);
    });

    test("fromComplexInterval maps chromosomal intervals to continuous", () => {
        const interval = [
            { chrom: "chr1", pos: 10 },
            { chrom: "chr2", pos: 5 },
        ];
        expect(fromComplexInterval(genome, interval)).toEqual([10, 105]);
    });
});
