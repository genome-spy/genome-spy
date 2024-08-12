import FlatQueue from "flatqueue";

import { field } from "../../utils/field.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/**
 * Computes coverage for sorted segments
 *
 * TODO: Binned coverage, e.g., don't emit a new segment for every
 * coverage change, but only every n bases or so. The most straightforward
 * way to implement it is a separate transform that bins the coverage
 * segments and calculates weighted averages.
 */
export default class CoverageTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @typedef {import("../flowNode.js").Datum} Datum
     */

    /**
     * @param {import("../../spec/transform.js").CoverageParams} params
     */
    constructor(params) {
        super(params);
        this.params = params;

        this.startAccessor = field(params.start);
        this.endAccessor = field(params.end);

        /** @type {function(any):string} */
        this.chromAccessor = params.chrom
            ? field(params.chrom)
            : (d) => undefined;
        /** @type {function(any):number} */
        this.weightAccessor = params.weight ? field(params.weight) : (d) => 1;

        this.as = {
            coverage: params.as ?? "coverage",
            start: params.asStart ?? params.start,
            end: params.asEnd ?? params.end,
            chrom: params.asChrom ?? params.chrom,
        };

        this.createSegment =
            /** @type {(start: Number, end: Number, coverage: Number, chrom?: string) => Datum} */ (
                new Function(
                    "start",
                    "end",
                    "coverage",
                    "chrom",
                    "return {" +
                        Object.entries(this.as)
                            .filter(([param, prop]) => prop)
                            .map(
                                ([param, prop]) =>
                                    `${JSON.stringify(prop)}: ${param}`
                            )
                            .join(", ") +
                        "};"
                )
            );

        /**
         * End pos as priority, weight as value
         *
         * @type {FlatQueue<number>}
         */
        this.ends = new FlatQueue();
    }

    reset() {
        super.reset();
        this.initialize();
    }

    initialize() {
        const asCoverage = this.as.coverage;
        const asEnd = this.as.end;
        const asChrom = this.as.chrom;

        const startAccessor = this.startAccessor;
        const endAccessor = this.endAccessor;
        const chromAccessor = this.chromAccessor;
        const weightAccessor = this.weightAccessor;

        /** @type {Datum} used for merging adjacent segment */
        let bufferedSegment;

        /** @type {string} */
        let prevChrom;

        /** @type {string} */
        let chrom;

        // TODO: Whattabout cumulative error when float weights are used?
        // Howabout https://github.com/d3/d3-array#fsum ?
        let coverage = 0;

        /** @type {number} */
        let prevEdge = NaN;

        /** End pos as priority, weight as value */
        const ends = this.ends;
        ends.clear();

        /**
         * @param {Datum} segment
         */
        const propagate = (segment) => {
            this._propagate(segment);
            bufferedSegment = null;
        };

        /**
         * @param {number} start
         * @param {number} end
         * @param {number} coverage
         */
        const pushSegment = (start, end, coverage) => {
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
                    propagate(bufferedSegment);
                }
            }

            if (!extended) {
                bufferedSegment = this.createSegment(
                    start,
                    end,
                    coverage,
                    chrom
                );
            }
        };

        const flushQueue = () => {
            let edge = 0;
            while ((edge = ends.peekValue()) !== undefined) {
                pushSegment(prevEdge, edge, coverage);
                prevEdge = edge;
                coverage -= ends.pop();
            }
            prevEdge = NaN;

            if (bufferedSegment) {
                propagate(bufferedSegment);
            }
        };

        /**
         * @param {Datum} datum
         */
        this.handle = (datum) => {
            const start = startAccessor(datum);

            let edge = 0;
            while ((edge = ends.peekValue()) !== undefined && edge < start) {
                pushSegment(prevEdge, edge, coverage);
                prevEdge = edge;
                coverage -= ends.pop();
            }

            if (asChrom) {
                let newChrom = chromAccessor(datum);
                if (newChrom !== prevChrom) {
                    flushQueue();
                    chrom = newChrom;
                    prevChrom = chrom;
                }
            }

            if (!isNaN(prevEdge)) {
                pushSegment(prevEdge, start, coverage);
            }
            prevEdge = start;

            const weight = weightAccessor(datum);
            coverage += weight;

            ends.push(weight, endAccessor(datum));
        };

        this.complete = () => {
            flushQueue();
            super.complete();
        };

        /**
         * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
         */
        this.beginBatch = (flowBatch) => {
            flushQueue();
            prevChrom = null;
            super.beginBatch(flowBatch);
        };
    }
}
