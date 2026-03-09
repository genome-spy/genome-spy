import { expect, test } from "vitest";
import cn from "./cn.js";

test("parses segment-style CN layout", () => {
    const data = `sample\tchrom\tstart\tend\tvalue
S1\tchr1\t1\t10\t0.5`;

    expect(cn(data)).toEqual([
        {
            sample: "S1",
            chrom: "chr1",
            start: 0,
            end: 10,
            value: 0.5,
        },
    ]);
});

test("parses matrix-style CN layout and unpivots rows", () => {
    const data = `chrom\tstart\tend\tSampleA\tSampleB
chr1\t1\t10\t0.5\t-0.2`;

    expect(cn(data)).toEqual([
        {
            chrom: "chr1",
            start: 0,
            end: 10,
            sample: "SampleA",
            value: 0.5,
        },
        {
            chrom: "chr1",
            start: 0,
            end: 10,
            sample: "SampleB",
            value: -0.2,
        },
    ]);
});

test("supports explicit columns for headerless CN data", () => {
    const data = "S1\tchr1\t1\t10\t0.5";

    expect(
        cn(data, {
            columns: ["sample", "chrom", "start", "end", "value"],
        })
    ).toEqual([
        {
            sample: "S1",
            chrom: "chr1",
            start: 0,
            end: 10,
            value: 0.5,
        },
    ]);
});

test("fails on unsupported CN layout", () => {
    const data = `chrom\tstart\tend
chr1\t1\t10`;

    expect(() => cn(data)).toThrow("does not match supported layouts");
});

test("fails when CN segment layout uses id instead of sample", () => {
    const data = `id\tchrom\tstart\tend\tvalue
S1\tchr1\t1\t10\t0.5`;

    expect(() => cn(data)).toThrow(
        "has a recognized value column but no sample column"
    );
});

test("coerces invalid start coordinates to null", () => {
    const data = `sample\tchrom\tstart\tend\tvalue
S1\tchr1\t0\t10\t0.5`;

    expect(cn(data)).toEqual([
        {
            sample: "S1",
            chrom: "chr1",
            start: null,
            end: 10,
            value: 0.5,
        },
    ]);
});
