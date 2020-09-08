import Heapify from "heapify";

const maxDepth = 65536;

/**
 * @typedef {import("../../spec/transform").PileupConfig} PileupConfig
 */

/**
 *
 * @param {PileupConfig} pileupConfig
 * @param {Record<string, any>[]} rows
 */
export default function pileupTransform(pileupConfig, rows) {
    const ends = new Heapify(maxDepth, [], [], Uint16Array, Float64Array);
    const freeLanes = new Heapify(maxDepth, [], [], Uint16Array, Uint16Array);

    const laneField = pileupConfig.lane || "lane";

    let maxLane = 0;

    for (const row of rows) {
        let lane = freeLanes.pop();
        if (lane === undefined) {
            lane = maxLane++;
        }
        row[laneField] = lane;

        while (ends.size && ends.peekPriority() < row[pileupConfig.start]) {
            const freeLane = ends.pop();
            freeLanes.push(freeLane, freeLane);
        }

        ends.push(lane, row[pileupConfig.end]);
    }

    return rows;
}
