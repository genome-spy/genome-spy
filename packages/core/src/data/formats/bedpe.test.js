import { expect, test } from "vitest";
import bedpe from "./bedpe.js";

test("parses headerless BEDPE with default positional columns", () => {
    const data = "chr1\t10\t20\tchr2\t30\t40\teventA\t5\t+\t-";

    expect(bedpe(data)).toEqual([
        {
            chrom1: "chr1",
            start1: 10,
            end1: 20,
            chrom2: "chr2",
            start2: 30,
            end2: 40,
            name: "eventA",
            score: 5,
            strand1: "+",
            strand2: "-",
        },
    ]);
});

test("parses BEDPE header row when present", () => {
    const data = `chrom1\tstart1\tend1\tchrom2\tstart2\tend2\tname
chr1\t10\t20\tchr2\t30\t40\teventA`;

    expect(bedpe(data)).toEqual([
        {
            chrom1: "chr1",
            start1: 10,
            end1: 20,
            chrom2: "chr2",
            start2: 30,
            end2: 40,
            name: "eventA",
        },
    ]);
});

test("normalizes unknown sentinels to null", () => {
    const data = "chr1\t-1\t-1\t.\t30\t40\t.\t.\t.\t.";

    expect(bedpe(data)).toEqual([
        {
            chrom1: "chr1",
            start1: null,
            end1: null,
            chrom2: null,
            start2: 30,
            end2: 40,
            name: null,
            score: null,
            strand1: null,
            strand2: null,
        },
    ]);
});

test("supports explicit columns for headerless files", () => {
    const data = "chr1\t10\t20\tchr2\t30\t40\teventA\t5";

    expect(
        bedpe(data, {
            columns: [
                "chrom1",
                "start1",
                "end1",
                "chrom2",
                "start2",
                "end2",
                "name",
                "score",
            ],
        })
    ).toEqual([
        {
            chrom1: "chr1",
            start1: 10,
            end1: 20,
            chrom2: "chr2",
            start2: 30,
            end2: 40,
            name: "eventA",
            score: 5,
        },
    ]);
});

test("skips rows with fewer than six columns", () => {
    expect(bedpe("chr1\t10\t20\tchr2\t30")).toEqual([]);
});
