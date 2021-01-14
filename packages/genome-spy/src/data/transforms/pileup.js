/* eslint-disable no-unmodified-loop-condition */
import Heapify from "heapify";
import { isNumber, field as vuField } from "vega-util";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

const maxDepth = 65536;

/**
 * @typedef {import("../../spec/transform").PileupParams} PileupParams
 */
export default class PileupTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {PileupParams} params
     */
    constructor(params) {
        super();

        this.params = params;
        this.initialize();
    }

    reset() {
        this.initialize();
    }

    initialize() {
        const params = this.params;
        const ends = new Heapify(maxDepth, [], [], Uint16Array, Float64Array);
        const freeLanes = new Heapify(
            maxDepth,
            [],
            [],
            Uint16Array,
            Uint16Array
        );

        const laneField = params.as || "lane";
        const spacing = isNumber(params.spacing) ? params.spacing : 1;
        const startAccessor = vuField(params.start);
        const endAccessor = vuField(params.end);

        // Keep track of the last processed element. Flush the queues if the start
        // pos suddenly decreases. This happens when piling up consecutive chromosomes.
        let lastStart = -Infinity;

        let maxLane = 0;

        /** @param {Record<string, any>} datum */
        this.handle = datum => {
            const start = startAccessor(datum);
            while (
                ends.size &&
                (ends.peekPriority() <= start || start < lastStart)
            ) {
                const freeLane = ends.pop();
                freeLanes.push(freeLane, freeLane);
            }
            lastStart = start;

            let lane = freeLanes.pop();
            if (lane === undefined) {
                lane = maxLane++;
            }

            datum[laneField] = lane;

            this._propagate(datum);

            ends.push(lane, endAccessor(datum) + spacing);
        };
    }
}
