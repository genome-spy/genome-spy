import { group as d3group } from "d3-array";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";
import { field } from "../../utils/field";
import iterateNestedMaps from "../../utils/iterateNestedMaps";

/**
 * A minimal aggregate transform that just counts grouped (by a single field) data items.
 * Work in progress.
 *
 * Eventually this will implement the most of Vega's aggregate transform:
 * https://vega.github.io/vega/docs/transforms/aggregate/
 */
export default class AggregateTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform").AggregateParams} params
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

        const groupby = params.groupby;

        const groupFieldAccessors = groupby.map((f) => field(f));

        // TODO: Fix case where no group fields are specified
        // @ts-expect-error
        const groups = d3group(this.buffer, ...groupFieldAccessors);

        for (const [group, data] of iterateNestedMaps(groups)) {
            /** @type {any} */
            const datum = {
                count: data.length,
            };

            for (let i = 0; i < groupby.length; i++) {
                datum[groupby[i]] = group[i];
            }

            this._propagate(datum);
        }

        super.complete();
    }
}
