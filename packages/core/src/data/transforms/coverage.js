import FlatQueue from "flatqueue";

import { field } from "../../utils/field.js";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode.js";

/**
 * Computes coverage for sorted segments
 *
 * TODO: Binned coverage
 */
export default class CoverageTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").CoverageParams} params
     */
    constructor(params) {
        super();
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
            coverage: params.as || "coverage",
            start: params.asStart || params.start,
            end: params.asEnd || params.end,
            chrom: params.asChrom || params.chrom,
        };

        // eslint-disable-next-line no-new-func
        this.createSegment = /** @type {function} */ (
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

        // End pos as priority, weight as value
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

        /** @type {Record<string, number|string>} used for merging adjacent segment */
        let bufferedSegment;

        /** @type {string} */
        let prevChrom;

        /** @type {string} */
        let chrom;

        // TODO: Whattabout cumulative error when float weights are used?
        // Howabout https://github.com/d3/d3-array#fsum ?
        let coverage = 0;

        /** @type {number} */
        let prevEdge;

        // End pos as priority, weight as value
        const ends = this.ends;
        ends.clear();

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
                    this._propagate(bufferedSegment);
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
            // Flush queue
            /** @type {number} */
            let edge;
            while ((edge = ends.peekValue()) !== undefined) {
                pushSegment(prevEdge, edge, coverage);
                prevEdge = edge;
                coverage -= ends.pop();
            }
            prevEdge = undefined;

            if (bufferedSegment) {
                this._propagate(bufferedSegment);
                bufferedSegment = undefined;
            }
        };

        /** @param {Record<string, any>} datum */
        this.handle = (datum) => {
            const start = startAccessor(datum);

            /** @type {number} */
            let edge;
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

            if (prevEdge !== undefined) {
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
    }
}
