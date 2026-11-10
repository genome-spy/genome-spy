import { compare } from "vega-util";
import { sum as d3sum } from "d3-array";
import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import Transform from "./transform.js";
import {
    createFileBatchAccessor,
    createFileBatchPropagator,
} from "../fileBatchUtils.js";

/** @type {(value: number, sum: number) => number} */
const normalize = (value, sum) => value / sum;

export default class StackTransform extends Transform {
    /** @type {import("../fileBatchUtils.js").FileBatchStart[]} */
    #fileBatchStarts = [];

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

        /** @type {any[]} */
        this.buffer = [];
    }

    reset() {
        super.reset();
        this.buffer = [];
        this.#fileBatchStarts = [];
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
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
        super.complete();
    }

    #flushBuffer() {
        const propagate = createFileBatchPropagator(
            createFileBatchAccessor(this.buffer, this.#fileBatchStarts),
            (batch) => super.beginBatch(batch),
            (datum) => this._propagate(datum)
        );
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

        const groupFields = this.createFieldAccessors(params, "groupby");

        const groups = Map.groupBy(this.buffer, (row) =>
            groupFields.map((f) => f(row)).join()
        );

        /** @type {(datum: any) => boolean} */
        let inclusionPredicate = (_datum) => true;

        if (params.baseField) {
            const baseAccessor = this.createFieldAccessor(params, "baseField");
            inclusionPredicate = (datum) => baseAccessor(datum) !== null;
        }

        /** @type {(value: number, sum: number) => number} */
        let offsetF = normalize;

        /** @type {(values: number[], accessor: (datum: any) => number) => number} */
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

        for (const group of groups.values()) {
            if (comparator) {
                group.sort(comparator);
            }

            const sum = sumF(group, valueAccessor);

            let prev = 0;
            for (const datum of group) {
                const current = prev + valueAccessor(datum);

                if (inclusionPredicate(datum)) {
                    datum[as[0]] = offsetF(prev, sum);
                    datum[as[1]] = offsetF(current, sum);

                    propagate(datum);
                    prev = current;
                }
            }
        }

        this.buffer = [];
        this.#fileBatchStarts = [];
    }
}
