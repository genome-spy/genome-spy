import Heapify from "heapify";

const maxDepth = 65536;

/**
 * @typedef {import("../../spec/transform").CoverageConfig} CoverageConfig
 */

/**
 *
 * @param {CoverageConfig} coverageConfig
 * @param {Record<string, any>[]} rows
 */
export default function pileupTransform(coverageConfig, rows) {
    const asCoverage = coverageConfig.as || "coverage";
    const asStart = coverageConfig.asStart || coverageConfig.start;
    const asEnd = coverageConfig.asEnd || coverageConfig.end;
    // TODO: chrom

    /**
     *
     * @param {number} start
     * @param {number} end
     * @param {number} coverage
     * @param {number} atStart
     */
    function toSegment(start, end, coverage, atStart) {
        return {
            [asStart]: start,
            [asEnd]: end,
            [asCoverage]: coverage,
            atStart
        };
    }

    /** @type {Record<string, number>[]} */
    const coverageSegments = [];

    // TODO: Whattabout cumulative error when float weights are used?
    let coverage = 0;

    /** @type {number} */
    let prevEdge;

    // End pos as priority, weight as value
    const ends = new Heapify(maxDepth, [], [], Float32Array, Float64Array);

    for (const row of rows) {
        // TODO: Optimization: don't introduce extra segments if several segments have the same start pos
        while (ends.size && ends.peekPriority() < row[coverageConfig.start]) {
            const edge = ends.peekPriority();
            if (edge > prevEdge) {
                coverageSegments.push(toSegment(prevEdge, edge, coverage, 0));
            }
            prevEdge = edge;
            coverage -= ends.pop();
        }

        // TODO: Optimization: don't break if adjacent segments have equal coverages
        // TODO: Optimization: don't introduce extra segments if several segments have the same end pos
        const edge = row[coverageConfig.start];
        if (prevEdge !== undefined) {
            coverageSegments.push(toSegment(prevEdge, edge, coverage, 1));
        }
        prevEdge = edge;

        const weight = 1;
        coverage += weight;

        ends.push(weight, row[coverageConfig.end]);
    }

    // Flush
    while (ends.size) {
        const edge = ends.peekPriority();
        if (edge > prevEdge) {
            coverageSegments.push(toSegment(prevEdge, edge, coverage, 0));
        }
        prevEdge = edge;
        coverage -= ends.pop();
    }

    // TODO: Optimizations:
    // Merge segments that have relative coverage difference less than X
    // Merge segments so that minimum segment length is Y

    console.log(coverageSegments);
    return coverageSegments;
}
