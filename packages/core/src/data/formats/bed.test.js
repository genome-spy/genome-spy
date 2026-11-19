import { expect, test } from "vitest";
import bed from "./bed.js";

test("parses BED rows without canonical interval fields", async () => {
    expect(await bed("chr1\t0\t10\tfeatureA\t5\t+")).toEqual([
        {
            chrom: "chr1",
            chromStart: 0,
            chromEnd: 10,
            name: "featureA",
            score: 5,
            strand: 1,
            itemRgb: null,
        },
    ]);
});

test("skips browser, track, and comment lines", async () => {
    const data = `browser position chr19:49302001-49304701
track type=bedGraph name="BedGraph Format"
# comment
   browser hide all
chr19\t49302000\t49302300`;

    expect(await bed(data)).toEqual([
        {
            chrom: "chr19",
            chromStart: 49302000,
            chromEnd: 49302300,
            strand: 0,
            itemRgb: null,
        },
    ]);
});

test("keeps fallback fieldN names from parser output", async () => {
    const data = "chr1\t0\t10\titem\t7\t+\t1\t9\t255,0,0\t2\t4,6,";

    expect(await bed(data)).toEqual([
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
            itemRgb: "255,0,0",
        },
    ]);
});

test("parses BED12 rows with BED12 field names", async () => {
    const data = "chr1\t0\t10\titem\t7\t+\t1\t9\t255,0,0\t2\t4,6,\t0,4,";

    expect(await bed(data)).toEqual([
        {
            chrom: "chr1",
            chromStart: 0,
            chromEnd: 10,
            name: "item",
            score: 7,
            strand: 1,
            thickStart: 1,
            thickEnd: 9,
            itemRgb: "255,0,0",
            blockCount: 2,
            blockSizes: [4, 6],
            blockStarts: [0, 4],
        },
    ]);
});

test("exposes the dot placeholder as a missing color in BED9 and BED12", async () => {
    const bed9 = "chr1\t0\t10\titem\t7\t+\t1\t9\t.";
    const bed12 = bed9 + "\t2\t4,6,\t0,4,";
    expect((await bed(bed9))[0]).toMatchObject({ field8: ".", itemRgb: null });
    expect((await bed(bed12))[0]).toMatchObject({ itemRgb: null });
});

test("keeps malformed percent escapes in chromosome names", async () => {
    expect(await bed("chr1%ZZ\t0\t10")).toEqual([
        {
            chrom: "chr1%ZZ",
            chromStart: 0,
            chromEnd: 10,
            strand: 0,
            itemRgb: null,
        },
    ]);
});

test("skips trailing empty lines at end of input", async () => {
    const data = "chr1\t0\t10\tfeatureA\t5\t+\n\n";

    expect(await bed(data)).toEqual([
        {
            chrom: "chr1",
            chromStart: 0,
            chromEnd: 10,
            name: "featureA",
            score: 5,
            strand: 1,
            itemRgb: null,
        },
    ]);
});
