import Heapify from "heapify";
import { field as vuField } from "vega-util";

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
    const asChrom = coverageConfig.asChrom || coverageConfig.chrom;

    const startAccessor = vuField(coverageConfig.start);
    const endAccessor = vuField(coverageConfig.end);
    /** @type {function(any):string} */
    const chromAccessor = coverageConfig.chrom
        ? vuField(coverageConfig.chrom)
        : d => undefined;
    /** @type {function(any):number} */
    const weightAccessor = coverageConfig.weight
        ? vuField(coverageConfig.weight)
        : d => 1;

    /** @type {Record<string, number|string>} used for merging adjacent segment */
    let bufferedSegment;

    /** @type {string} */
    let prevChrom;

    /** @type {string} */
    let chrom;

    /** @type {Record<string, number|string>[]} */
    const coverageSegments = [];

    // TODO: Whattabout cumulative error when float weights are used?
    let coverage = 0;

    /** @type {number} */
    let prevEdge;

    // End pos as priority, weight as value
    const ends = new Heapify(maxDepth, [], [], Float32Array, Float64Array);

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
            } else if (bufferedSegment[asCoverage] != 0) {
                coverageSegments.push(bufferedSegment);
            }
        }

        if (!extended) {
            bufferedSegment = {
                [asStart]: start,
                [asEnd]: end,
                [asCoverage]: coverage
            };
            if (chrom) {
                bufferedSegment[asChrom] = chrom;
            }
        }
    }

    function flushQueue() {
        // Flush queue
        while (ends.size) {
            const edge = ends.peekPriority();
            pushSegment(prevEdge, edge, coverage);
            prevEdge = edge;
            coverage -= ends.pop();
        }
        prevEdge = undefined;

        if (bufferedSegment) {
            coverageSegments.push(bufferedSegment);
            bufferedSegment = undefined;
        }
    }

    for (const row of rows) {
        while (ends.size && ends.peekPriority() < startAccessor(row)) {
            const edge = ends.peekPriority();
            pushSegment(prevEdge, edge, coverage);
            prevEdge = edge;
            coverage -= ends.pop();
        }

        if (asChrom) {
            let newChrom = chromAccessor(row);
            if (newChrom != prevChrom) {
                flushQueue();
                chrom = newChrom;
                prevChrom = chrom;
            }
        }

        const edge = startAccessor(row);
        if (prevEdge !== undefined) {
            pushSegment(prevEdge, edge, coverage);
        }
        prevEdge = edge;

        const weight = weightAccessor(row);
        coverage += weight;

        ends.push(weight, endAccessor(row));
    }

    flushQueue();

    return coverageSegments;
}
