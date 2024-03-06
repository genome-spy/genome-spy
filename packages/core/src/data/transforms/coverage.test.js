import { describe, expect, test } from "vitest";
import CoverageTransform from "./coverage.js";
import { processData } from "../flowTestUtils.js";

/**
 * @typedef {import("../../spec/transform.js").CoverageParams} CoverageParams
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

/**
 *
 * @param {[number, number][]} reads Start, end
 * @param {[number, number, number][]} coverageSegments Start, end, coverage
 */
function testSimpleCoverage(reads, coverageSegments) {
    /** @type {CoverageParams} */
    const coverageConfig = {
        type: "coverage",
        start: "start",
        end: "end",
    };
    expect(
        transform(
            coverageConfig,
            reads.map((d) => ({
                start: d[0],
                end: d[1],
            }))
        )
    ).toEqual(
        coverageSegments.map((d) => ({
            start: d[0],
            end: d[1],
            coverage: d[2],
        }))
    );
}

/**
 *
 * @param {[number, number, number][]} reads Start, end, weight
 * @param {[number, number, number][]} coverageSegments Start, end, coverage
 */
function testWeightedCoverage(reads, coverageSegments) {
    /** @type {CoverageParams} */
    const coverageConfig = {
        type: "coverage",
        start: "start",
        end: "end",
        weight: "weight",
    };
    expect(
        transform(
            coverageConfig,
            reads.map((d) => ({
                start: d[0],
                end: d[1],
                weight: d[2],
            }))
        )
    ).toEqual(
        coverageSegments.map((d) => ({
            start: d[0],
            end: d[1],
            coverage: d[2],
        }))
    );
}

describe("Coverage transform", () => {
    test("Typical case", () =>
        testSimpleCoverage(
            [
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
            ],
            [
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
            ]
        ));

    test("Multiple identical overlapping segments", () =>
        testSimpleCoverage(
            [
                [1, 2],
                [3, 4],
                [3, 4],
                [5, 6],
                [5, 6],
                [5, 6],
            ],
            [
                [1, 2, 1],
                [3, 4, 2],
                [5, 6, 3],
            ]
        ));

    test("Adjacent segments with equal coverage are merged", () =>
        testSimpleCoverage(
            [
                [1, 2],
                [2, 3],
                [3, 4],
                [5, 6],
                [6, 7],
                [7, 8],
            ],
            [
                [1, 4, 1],
                [5, 8, 1],
            ]
        ));

    test("Chromosomes pass through", () => {
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

    test("Typical weighted coverage", () =>
        testWeightedCoverage(
            [
                [0, 4, 1],
                [1, 3, 2],
                [2, 6, 3],
                [8, 10, -1],
            ],
            [
                [0, 1, 1],
                [1, 2, 3],
                [2, 3, 6],
                [3, 4, 4],
                [4, 6, 3],
                [8, 10, -1],
            ]
        ));

    test("Multiple weights at a single locus", () =>
        testWeightedCoverage(
            [
                // -- Locus 1
                [1, 2, 1],
                [1, 2, 2],
                [1, 2, 3],
                [1, 2, 4],
                [1, 2, 5],
                // -- Locus 2
                [2, 3, 2],
                [2, 3, 3],
                [2, 3, 4],
                [2, 3, 5],
                [2, 3, 6],
            ],
            [
                // -- Locus 1
                [1, 2, 15],
                // -- Locus 2
                [2, 3, 20],
            ]
        ));

    test("Adjacent segments with different weights produce separated segments", () =>
        testWeightedCoverage(
            [
                // -- Cluster 1
                [1, 2, 2],
                [2, 3, 1],
                [3, 4, 1],
                // -- Cluster 2
                [5, 6, 1],
                [6, 7, 2],
                [7, 8, 1],
                // -- Cluster 3
                [9, 10, 1],
                [10, 11, 1],
                [11, 12, 2],
            ],
            [
                // -- Cluster 1
                [1, 2, 2],
                [2, 4, 1],
                // -- Cluster 2
                [5, 6, 1],
                [6, 7, 2],
                [7, 8, 1],
                // -- Cluster 3
                [9, 11, 1],
                [11, 12, 2],
            ]
        ));
});
