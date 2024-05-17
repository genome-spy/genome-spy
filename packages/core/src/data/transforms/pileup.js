/* eslint-disable no-unmodified-loop-condition */
import FlatQueue from "flatqueue";
import { isNumber } from "vega-util";
import { field } from "../../utils/field.js";
import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import Transform from "./transform.js";

const maxDepth = 65536;

export default class PileupTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").PileupParams} params
     */
    constructor(params) {
        super(params);

        this.params = params;
    }

    reset() {
        super.reset();
        this.initialize();
    }

    initialize() {
        const params = this.params;

        const laneField = params.as || "lane";
        const spacing = isNumber(params.spacing) ? params.spacing : 1;
        const startAccessor = field(params.start);
        const endAccessor = field(params.end);

        // We choose the implementation based on the need of order preference.
        // The preference-aware algorithm has a lousy O(n^2) time complexity but
        // it's acceptable for finding lanes for genes based on their strands.

        // Both implementations expect the items to be sorted by their start
        // coordinates.

        if (!params.preference !== !params.preferredOrder) {
            throw new Error(
                `Must specify both "preference" and "preferredOrder"`
            );
        } else if (params.preference) {
            const freeLaneMap = new Float64Array(maxDepth);

            const preferenceAccessor = field(params.preference);
            /** @type {any[]} */
            const preferredOrder = params.preferredOrder;

            let lastStart = Infinity;

            /** @param {Record<string, any>} datum */
            this.handle = (datum) => {
                const start = startAccessor(datum);
                if (start < lastStart) {
                    // Reset if encountered a new chromosome...
                    freeLaneMap.fill(-Infinity);
                }
                lastStart = start;

                // Linear search, but the number of preferences is likely be low
                const preferredLane = preferredOrder.indexOf(
                    preferenceAccessor(datum)
                );
                let lane = -1;
                if (preferredLane >= 0 && freeLaneMap[preferredLane] < start) {
                    lane = preferredLane;
                } else {
                    const start = startAccessor(datum);
                    for (lane = 0; lane < freeLaneMap.length; lane++) {
                        if (freeLaneMap[lane] < start) {
                            break;
                        }
                    }
                    if (lane >= freeLaneMap.length) {
                        throw new Error("Out of lanes!");
                    }
                }
                freeLaneMap[lane] = endAccessor(datum) + spacing;
                datum[laneField] = lane;
                this._propagate(datum);
            };
        } else {
            /** @type {FlatQueue<number>} */
            const ends = new FlatQueue();

            /** @type {FlatQueue<number>} */
            const freeLanes = new FlatQueue();

            // Keep track of the last processed element. Flush the queues if the start
            // pos suddenly decreases. This happens when piling up consecutive chromosomes.
            let lastStart = -Infinity;

            let maxLane = 0;

            /** @param {Record<string, any>} datum */
            this.handle = (datum) => {
                const start = startAccessor(datum);
                while (
                    ends.length &&
                    (ends.peekValue() <= start || start < lastStart)
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
}
