import Heapify from "heapify";
import { isNumber, field as vuField } from "vega-util";

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

    const laneField = pileupConfig.as || "lane";
    const spacing = isNumber(pileupConfig.spacing) ? pileupConfig.spacing : 1;
    const startAccessor = vuField(pileupConfig.start);
    const endAccessor = vuField(pileupConfig.end);

    let maxLane = 0;

    for (const row of rows) {
        while (ends.size && ends.peekPriority() <= startAccessor(row)) {
            const freeLane = ends.pop();
            freeLanes.push(freeLane, freeLane);
        }

        let lane = freeLanes.pop();
        if (lane === undefined) {
            lane = maxLane++;
        }

        row[laneField] = lane;

        ends.push(lane, endAccessor(row) + spacing);
    }

    return rows;
}
