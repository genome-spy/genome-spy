import { expect, test } from "vitest";
import bed from "./bed.js";

test("parses BED rows without canonical interval fields", () => {
    expect(bed("chr1\t0\t10\tfeatureA\t5\t+")).toEqual([
        {
            chrom: "chr1",
            chromStart: 0,
            chromEnd: 10,
            name: "featureA",
            score: 5,
            strand: 1,
        },
    ]);
});

test("skips browser, track, and comment lines", () => {
    const data = `browser position chr19:49302001-49304701
track type=bedGraph name="BedGraph Format"
# comment
chr19\t49302000\t49302300`;

    expect(bed(data)).toEqual([
        {
            chrom: "chr19",
            chromStart: 49302000,
            chromEnd: 49302300,
            strand: 0,
        },
    ]);
});

test("keeps fallback fieldN names from parser output", () => {
    const data = "chr1\t0\t10\titem\t7\t+\t1\t9\t255,0,0\t2\t4,6,";

    expect(bed(data)).toEqual([
        {
            chrom: "chr1",
            chromStart: 0,
            chromEnd: 10,
            name: "item",
            score: 7,
            strand: 1,
            field6: "1",
            field7: "9",
            field8: "255,0,0",
            field9: "2",
            field10: "4,6,",
        },
    ]);
});

test("reports malformed chromosome decoding with line context", () => {
    expect(() => bed("chr1%ZZ\t0\t10")).toThrow(
        "Cannot parse BED line 1: URI malformed"
    );
});
