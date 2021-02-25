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

        const accessor = params.field ? field(params.field) : d => 1;

        const groupFields = params.groupby.map(f => field(f));

        const groups = d3groups(this.buffer, row =>
            groupFields.map(f => f(row)).join()
        ).map(a => a[1]);

        /** @type {function(number, number):number} */
        const offsetF =
            params.offset == "normalize"
                ? (value, sum) => value / sum
                : params.offset == "center"
                ? (value, sum) => value - sum / 2
                : (value, sum) => value;

        for (const group of groups) {
            if (comparator) {
                group.sort(comparator);
            }

            const sum = d3sum(group, accessor);

            let prev = 0;
            for (const datum of group) {
                const current = prev + accessor(datum);

                datum[as[0]] = offsetF(prev, sum);
                datum[as[1]] = offsetF(current, sum);

                this._propagate(datum);

                prev = current;
            }
        }

        super.complete();
    }
}
