import CoverageTransform from "./coverage";
import { processData } from "../flowTestUtils";

/**
 * @typedef {import("../../spec/transform").CoverageParams} CoverageParams
 */

/**
 * @param {CoverageParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    const t = new CoverageTransform(params);
    t.initialize();
    return processData(t, data);
}

test("Coverage transform produces correct coverage segments", () => {
    const reads = [
        [0, 4],
        [1, 3],
        [2, 6],
        [4, 8],
        [8, 10],
        [11, 14],
        [11, 13],
        [11, 12],
        [15, 18],
        [16, 18],
        [17, 18],
    ].map((d) => ({
        start: d[0],
        end: d[1],
    }));

    const coverageSegments = [
        [0, 1, 1],
        [1, 2, 2],
        [2, 3, 3],
        [3, 6, 2],
        [6, 10, 1],
        [11, 12, 3],
        [12, 13, 2],
        [13, 14, 1],
        [15, 16, 1],
        [16, 17, 2],
        [17, 18, 3],
    ].map((d) => ({
        start: d[0],
        end: d[1],
        coverage: d[2],
    }));

    /** @type {CoverageParams} */
    const coverageConfig = {
        type: "coverage",
        start: "start",
        end: "end",
    };
    expect(transform(coverageConfig, reads)).toEqual(coverageSegments);
});

test("Coverage transform handles chromosomes", () => {
    const reads = [
        { chrom: "chr1", start: 0, end: 1 },
        { chrom: "chr2", start: 0, end: 1 },
        { chrom: "chr3", start: 1, end: 3 },
    ];

    const coverageSegments = [
        { chrom: "chr1", start: 0, end: 1, coverage: 1 },
        { chrom: "chr2", start: 0, end: 1, coverage: 1 },
        { chrom: "chr3", start: 1, end: 3, coverage: 1 },
    ];

    /** @type {CoverageParams} */
    const coverageConfig = {
        type: "coverage",
        chrom: "chrom",
        start: "start",
        end: "end",
    };

    expect(transform(coverageConfig, reads)).toEqual(coverageSegments);
});

test("Coverage transform handles weights", () => {
    const reads = [
        [0, 4, 1],
        [1, 3, 2],
        [2, 6, 3],
        [8, 10, -1],
    ].map((d) => ({
        start: d[0],
        end: d[1],
        weight: d[2],
    }));

    const coverageSegments = [
        [0, 1, 1],
        [1, 2, 3],
        [2, 3, 6],
        [3, 4, 4],
        [4, 6, 3],
        [8, 10, -1],
    ].map((d) => ({
        start: d[0],
        end: d[1],
        coverage: d[2],
    }));

    /** @type {CoverageParams} */
    const coverageConfig = {
        type: "coverage",
        chrom: "chrom",
        start: "start",
        end: "end",
        weight: "weight",
    };

    expect(transform(coverageConfig, reads)).toEqual(coverageSegments);
});
