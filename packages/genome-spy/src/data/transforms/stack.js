import { compare } from "vega-util";
import { groups as d3groups, sum as d3sum } from "d3-array";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";
import { field } from "../../utils/field";

/**
 * @typedef {import("../../spec/transform").StackParams} StackParams
 */
export default class StackTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     * @param {StackParams} params
     */
    constructor(params) {
        super();
        this.params = params;

        /** @type {any[]} */
        this.buffer = [];
    }

    reset() {
        this.buffer = [];
    }

    /**
     *
     * @param {import("../flowNode").Datum} datum
     */
    handle(datum) {
        this.buffer.push(datum);
    }

    complete() {
        const params = this.params;

        const as = params.as || ["y0", "y1"]; // TODO: Validate

        const comparator = params.sort
            ? compare(params.sort.field, params.sort.order)
            : undefined;

        const valueAccessor = params.field ? field(params.field) : (d) => 1;

        const groupFields = params.groupby.map((f) => field(f));

        const groups = d3groups(this.buffer, (row) =>
            groupFields.map((f) => f(row)).join()
        ).map((a) => a[1]);

        /** @type {(datum: any) => boolean} */
        let inclusionPredicate = (datum) => true;

        if (params.baseField) {
            const baseAccessor = field(params.baseField);
            inclusionPredicate = (datum) => baseAccessor(datum) !== null;
        }

        /** @type {(value: number, sum: number) => number} */
        let offsetF;

        /** @type {(values: number[], accessor: (datum: any) => number) => number} */
        let sumF;

        switch (params.offset) {
            case "normalize":
                offsetF = (value, sum) => value / sum;
                sumF = (values, accessor) => d3sum(values, accessor);
                break;
            case "center":
                offsetF = (value, sum) => value - sum / 2;
                sumF = (values, accessor) => d3sum(values, accessor);
                break;
            case "information":
                {
                    // Sequence logos: a new way to display consensus sequences (Schneider and Stephens)
                    // doi://10.1093/nar/18.20.6097

                    const maxBits = Math.log2(params.cardinality ?? 4);
                    offsetF = (value, sum) => value / sum;
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
                sumF = (values, accessor) => 1;
        }

        for (const group of groups) {
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

                    this._propagate(datum);
                    prev = current;
                }
            }
        }

        super.complete();
    }
}
