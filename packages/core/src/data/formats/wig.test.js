import { expect, test } from "vitest";
import wig from "./wig.js";

test("parses fixedStep records as zero-based half-open intervals", () => {
    expect(
        wig(`track type=wiggle_0
fixedStep chrom=chr1 start=10 step=5 span=2
1.5
-2`)
    ).toEqual([
        { chrom: "chr1", start: 9, end: 11, score: 1.5 },
        { chrom: "chr1", start: 14, end: 16, score: -2 },
    ]);
});

test("parses variableStep records and skips control lines", () => {
    expect(
        wig(`browser position chr2:100-110
# comment
variableStep chrom=chr2 span=3
101 4.25
105 -1`)
    ).toEqual([
        { chrom: "chr2", start: 100, end: 103, score: 4.25 },
        { chrom: "chr2", start: 104, end: 107, score: -1 },
    ]);
});

test("defaults fixedStep step and span to one", () => {
    expect(wig("fixedStep chrom=chr1 start=1\n0\n2")).toEqual([
        { chrom: "chr1", start: 0, end: 1, score: 0 },
        { chrom: "chr1", start: 1, end: 2, score: 2 },
    ]);
});

test("rejects data that is not declared WIG", () => {
    expect(() => wig("chr1\t0\t10\t5")).toThrow("Cannot parse WIG line 1");
});
