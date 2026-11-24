import FlatQueue from "flatqueue";

import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/** @typedef {import("../flowNode.js").Datum} Datum */

/** Computes scalar coverage for start-sorted segments. */
export default class CoverageTransform extends Transform {
    /** @type {FlatQueue<number>} */
    #ends = new FlatQueue();

    /** @type {Datum | undefined} */
    #segment;

    /** @type {number | undefined} */
    #position;

    /** @type {string | undefined} */
    #chrom;

    #coverage = 0;

    get behavior() {
        return BEHAVIOR_CLONES;
    }

    get createsNewIdentity() {
        return true;
    }

    /**
     * @param {import("../../spec/transform.js").CoverageParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.as = {
            coverage: params.as ?? "coverage",
            start: params.asStart ?? params.start,
            end: params.asEnd ?? params.end,
            chrom: params.asChrom ?? params.chrom,
        };
        this.startAccessor = this.createFieldAccessor(params, "start");
        this.endAccessor = this.createFieldAccessor(params, "end");

        /** @type {(datum: Datum) => string | undefined} */
        this.chromAccessor =
            this.as.chrom && params.chrom
                ? this.createFieldAccessor(params, "chrom")
                : () => undefined;
        this.weightAccessor = params.weight
            ? this.createFieldAccessor(params, "weight")
            : () => 1;

        // Give generated rows a fixed shape even with custom output names.
        const fields = Object.entries(this.as)
            .filter(([, name]) => name)
            .map(([value, name]) => `${JSON.stringify(name)}: ${value}`);
        this.createSegment =
            /** @type {(start: number, end: number, coverage: number, chrom: string | undefined) => Datum} */ (
                new Function(
                    "start",
                    "end",
                    "coverage",
                    "chrom",
                    `return {${fields.join(", ")}};`
                )
            );
    }

    reset() {
        super.reset();
        this.#ends.clear();
        this.#segment = undefined;
        this.#position = undefined;
        this.#chrom = undefined;
        this.#coverage = 0;
    }

    /** @param {Datum} datum */
    handle(datum) {
        const start = this.startAccessor(datum);
        const end = this.endAccessor(datum);
        const chrom = this.chromAccessor(datum);
        const weight = this.weightAccessor(datum);
        if (chrom !== this.#chrom) {
            this.#flush();
            this.#chrom = chrom;
        }

        this.#drainEnds(start);
        this.#spanUntil(start);
        this.#coverage += weight;
        this.#ends.push(weight, end);
    }

    /** @param {import("../../types/flowBatch.js").FlowBatch} batch */
    beginBatch(batch) {
        if (batch.type === "file" && this.inFacet) return;
        this.#flush();
        super.beginBatch(batch);
    }

    complete() {
        this.#flush();
        super.complete();
    }

    /**
     * Keep ends tied with the next start queued to preserve weight arithmetic
     * order. With no start, drain the remaining ends.
     * @param {number} [start]
     */
    #drainEnds(start) {
        let end;
        while (
            (end = this.#ends.peekValue()) !== undefined &&
            (start === undefined || end < start)
        ) {
            this.#spanUntil(end);
            const weight = this.#ends.pop();
            // An empty queue is zero coverage even after roundoff.
            this.#coverage = this.#ends.length ? this.#coverage - weight : 0;
        }
    }

    /** @param {number} end */
    #spanUntil(end) {
        const start = this.#position;
        this.#position = end;
        if (start === undefined || start === end) return;

        const as = this.as;
        if (this.#segment) {
            const previous = this.#segment[as.coverage];
            if (previous === this.#coverage) {
                this.#segment[as.end] = end;
                return;
            }
            if (previous !== 0) this._propagate(this.#segment);
        }

        this.#segment = this.createSegment(
            start,
            end,
            this.#coverage,
            this.#chrom
        );
    }

    #flush() {
        this.#drainEnds();
        if (this.#segment) this._propagate(this.#segment);
        this.#position = undefined;
        this.#segment = undefined;
    }
}
