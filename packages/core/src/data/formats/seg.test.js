import { expect, test } from "vitest";
import seg from "./seg.js";

test("parses SEG with header row and normalizes coordinates", () => {
    const data = `ID\tchrom\tloc.start\tloc.end\tnum.mark\tseg.mean
S1\tchr1\t1\t100\t10\t0.5`;

    expect(seg(data)).toEqual([
        {
            ID: "S1",
            chrom: "chr1",
            "loc.start": "1",
            "loc.end": "100",
            "num.mark": "10",
            "seg.mean": "0.5",
            sample: "S1",
            start: 0,
            end: 100,
            numMarkers: 10,
            segmentMean: 0.5,
        },
    ]);
});

test("parses headerless SEG using explicit columns", () => {
    const data = "S1\tchr1\t1\t100\t10\t0.5";

    expect(
        seg(data, {
            columns: [
                "sample",
                "chrom",
                "start",
                "end",
                "numMarkers",
                "segmentMean",
            ],
        })
    ).toEqual([
        {
            sample: "S1",
            chrom: "chr1",
            start: 0,
            end: 100,
            numMarkers: 10,
            segmentMean: 0.5,
        },
    ]);
});

test("fails when required columns are missing", () => {
    const data = `sample\tchrom\tstart\tend\tsegmentMean
S1\tchr1\t1\t100\t0.5`;

    expect(() => seg(data)).toThrow(
        'SEG input is missing a required column for "numMarkers".'
    );
});

test("coerces invalid start coordinates to null", () => {
    const data = `sample\tchrom\tstart\tend\tnumMarkers\tsegmentMean
S1\tchr1\t0\t100\t10\t0.5`;

    expect(seg(data)).toEqual([
        {
            sample: "S1",
            chrom: "chr1",
            start: null,
            end: 100,
            numMarkers: 10,
            segmentMean: 0.5,
        },
    ]);
});

test("fails when using unsupported alias for segment mean", () => {
    const data = `ID\tchrom\tloc.start\tloc.end\tnum.mark\tlog2
S1\tchr1\t1\t100\t10\t0.5`;

    expect(() => seg(data)).toThrow(
        'SEG input is missing a required column for "segmentMean".'
    );
});
