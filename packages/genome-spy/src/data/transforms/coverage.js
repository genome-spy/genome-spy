import Heapify from "heapify";

const maxDepth = 65536;

/**
 * @typedef {import("../../spec/transform").CoverageConfig} CoverageConfig
 */

/**
 * Computes coverage for sorted segments
 *
 * TODO: Binned coverage
 * TODO: Weighted coverage
 *
 * @param {CoverageConfig} coverageConfig
 * @param {Record<string, any>[]} rows
 */
export default function coverageTransform(coverageConfig, rows) {
    const asCoverage = coverageConfig.as || "coverage";
    const asStart = coverageConfig.asStart || coverageConfig.start;
    const asEnd = coverageConfig.asEnd || coverageConfig.end;
    // TODO: chrom

    /** @type {Record<string, number>} used for merging adjacent segment */
    let bufferedSegment;

    /**
     * @param {number} start
     * @param {number} end
     * @param {number} coverage
     */
    function pushSegment(start, end, coverage) {
        if (start == end) {
            return;
        }

        let extended = false;
        if (bufferedSegment) {
            if (bufferedSegment[asCoverage] === coverage) {
                // Extend it
                bufferedSegment[asEnd] = end;
                extended = true;
            } else if (bufferedSegment[asCoverage] > 0) {
                coverageSegments.push(bufferedSegment);
            }
        }

        if (!extended) {
            bufferedSegment = {
                [asStart]: start,
                [asEnd]: end,
                [asCoverage]: coverage
            };
        }
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
        while (ends.size && ends.peekPriority() < row[coverageConfig.start]) {
            const edge = ends.peekPriority();
            pushSegment(prevEdge, edge, coverage);
            prevEdge = edge;
            coverage -= ends.pop();
        }

        const edge = row[coverageConfig.start];
        if (prevEdge !== undefined) {
            pushSegment(prevEdge, edge, coverage);
        }
        prevEdge = edge;

        const weight = 1;
        coverage += weight;

        ends.push(weight, row[coverageConfig.end]);
    }

    // Flush queue
    while (ends.size) {
        const edge = ends.peekPriority();
        pushSegment(prevEdge, edge, coverage);
        prevEdge = edge;
        coverage -= ends.pop();
    }

    if (bufferedSegment) {
        coverageSegments.push(bufferedSegment);
    }

    return coverageSegments;
}
