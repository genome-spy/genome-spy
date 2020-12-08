import { compare, field as vuField } from "vega-util";
import { groups as d3groups, sum as d3sum } from "d3-array";
import FlowNode from "../flowNode";

/**
 * @typedef {import("../../spec/transform").StackConfig} StackConfig
 */

export default class StackTransform extends FlowNode {
    /**
     *
     * @param {StackConfig} params
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
     * @param {any} datum
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

        const accessor = params.field ? vuField(params.field) : d => 1;

        const groupFields = params.groupby.map(f => vuField(f));

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
            for (const row of group) {
                const current = prev + accessor(row);

                // TODO: Modify in-place if safe
                this._propagate({
                    ...row,
                    [as[0]]: offsetF(prev, sum),
                    [as[1]]: offsetF(current, sum)
                });

                prev = current;
            }
        }

        super.complete();
    }
}
