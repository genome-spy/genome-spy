import { compare } from "vega-util";
import { sum as d3sum } from "d3-array";
import { asArray } from "../../utils/arrayUtils.js";
import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import { findContiguousKey } from "../outputGrouping.js";
import partitionRows from "../partitionRows.js";
import Transform from "./transform.js";
import {
    createFileBatchAccessor,
    createFileBatchPropagator,
} from "../fileBatchUtils.js";

/** @typedef {import("../flowNode.js").Datum} Datum */
/** @typedef {(group: Datum[], propagate: (datum: Datum) => void) => void} GroupLayout */

/** @type {(value: number, sum: number) => number} */
const normalize = (value, sum) => value / sum;

export default class StackTransform extends Transform {
    /** @type {import("../fileBatchUtils.js").FileBatchStart[]} */
    #fileBatchStarts = [];

    /** @type {readonly string[] | null | undefined} */
    #streamKey;

    /** @type {GroupLayout | undefined} */
    #groupLayout;

    /** @param {Datum} datum */
    #emit = (datum) => this._propagate(datum);

    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").StackParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);
        this.params = params;

        /** @type {Datum[]} */
        this.buffer = [];
    }

    reset() {
        super.reset();
        this.buffer = [];
        this.#fileBatchStarts = [];
        this.#streamKey = undefined;
        this.#groupLayout = undefined;
    }

    /**
     *
     * @param {Datum} datum
     */
    handle(datum) {
        if (this.#streamKey === undefined) {
            // A collector exposes its grouping only once its snapshot can be read.
            const grouping = this.parent?.outputGrouping;
            this.#streamKey =
                (grouping?.fileFree &&
                    findContiguousKey(
                        grouping,
                        asArray(this.params.groupby)
                    )) ||
                null;
        }
        const first = this.buffer[0];
        if (
            this.#streamKey &&
            first &&
            !sameGroup(this.#streamKey, first, datum)
        ) {
            this.#flushRun();
        }
        this.buffer.push(datum);
    }

    /** @param {import("../../types/flowBatch.js").FlowBatch} batch */
    beginBatch(batch) {
        if (batch.type == "file") {
            this.#fileBatchStarts.push({ index: this.buffer.length, batch });
        } else {
            this.#flushBuffer();
            super.beginBatch(batch);
        }
    }

    complete() {
        this.#flushBuffer();
        this.#streamKey = undefined;
        this.#groupLayout = undefined;
        super.complete();
    }

    #flushRun() {
        if (!this.buffer.length) return;

        try {
            (this.#groupLayout ??= this.#createGroupLayout())(
                this.buffer,
                this.#emit
            );
        } finally {
            // A source may still complete after a downstream row error.
            this.buffer.length = 0;
        }
    }

    #flushBuffer() {
        if (this.#streamKey) {
            this.#flushRun();
            return;
        }

        const propagate = createFileBatchPropagator(
            createFileBatchAccessor(this.buffer, this.#fileBatchStarts),
            (batch) => super.beginBatch(batch),
            this.#emit
        );

        /** @type {Map<number, Date>} */
        const dates = new Map();
        const groupFields = this.createFieldAccessors(
            this.params,
            "groupby"
        ).map((accessor) => /** @param {Datum} datum */ (datum) => {
            const key = accessor(datum);
            if (!(key instanceof Date)) return key;

            // Parsed dates with the same timestamp share a key of their own type.
            const time = key.getTime();
            const previous = dates.get(time);
            if (previous) return previous;
            dates.set(time, key);
            return key;
        });
        const layout = (this.#groupLayout ??= this.#createGroupLayout());
        for (const group of partitionRows(this.buffer, groupFields)) {
            layout(group, propagate);
        }

        this.buffer = [];
        this.#fileBatchStarts = [];
    }

    /** @returns {GroupLayout} */
    #createGroupLayout() {
        const params = this.params;
        const as = params.as || ["y0", "y1"]; // TODO: Validate

        const comparator = params.sort
            ? compare(
                  this.createFieldAccessors(params.sort, "field"),
                  params.sort.order
              )
            : undefined;

        const valueAccessor = params.field
            ? this.createFieldAccessor(params, "field")
            : () => 1;

        /** @type {(datum: Datum) => boolean} */
        let inclusionPredicate = (_datum) => true;

        if (params.baseField) {
            const baseAccessor = this.createFieldAccessor(params, "baseField");
            inclusionPredicate = (datum) => baseAccessor(datum) !== null;
        }

        /** @type {(value: number, sum: number) => number} */
        let offsetF = normalize;

        /** @type {(values: Datum[], accessor: (datum: Datum) => number) => number} */
        let sumF = d3sum;

        switch (params.offset) {
            case "normalize":
                break;
            case "center":
                offsetF = (value, sum) => value - sum / 2;
                break;
            case "information":
                {
                    // Sequence logos: a new way to display consensus sequences (Schneider and Stephens)
                    // doi://10.1093/nar/18.20.6097

                    const maxBits = Math.log2(params.cardinality ?? 4);
                    sumF = (values, accessor) => {
                        const e = 0; // TODO: Correction factor for small sample sizes

                        const gaps = d3sum(
                            values,
                            (d) => +!inclusionPredicate(d)
                        );
                        const total = d3sum(values, accessor);
                        const nonGaps = total - gaps;

                        let H = 0;
                        for (let i = 0; i < values.length; i++) {
                            const datum = values[i];
                            if (inclusionPredicate(datum)) {
                                const b = accessor(datum) / nonGaps;
                                H -= b * Math.log2(b);
                            }
                        }

                        return (
                            (nonGaps / (maxBits - (H + e))) * (nonGaps / total)
                        );
                    };
                }
                break;
            default:
                offsetF = (value, sum) => value;
                sumF = (_values, _accessor) => 1;
        }

        const diverging = params.offset === "diverging";
        return (group, propagate) => {
            if (comparator) {
                group.sort(comparator);
            }

            const sum = sumF(group, valueAccessor);

            let prev = 0;
            let negative = 0;
            for (const datum of group) {
                const value = valueAccessor(datum);
                if (!inclusionPredicate(datum)) continue;

                if (diverging && (!Number.isFinite(value) || value === 0)) {
                    const endpoint = value === 0 ? 0 : NaN;
                    datum[as[0]] = endpoint;
                    datum[as[1]] = endpoint;
                } else if (diverging && value < 0) {
                    datum[as[1]] = negative;
                    negative += value;
                    datum[as[0]] = negative;
                } else {
                    datum[as[0]] = offsetF(prev, sum);
                    prev += value;
                    datum[as[1]] = offsetF(prev, sum);
                }

                propagate(datum);
            }
        };
    }
}

/**
 * @param {readonly string[]} columns
 * @param {Datum} a
 * @param {Datum} b
 */
function sameGroup(columns, a, b) {
    for (const column of columns) {
        if (a[column] !== b[column]) return false;
    }
    return true;
}
