import { compare } from "vega-util";
import FlowNode from "./flowNode";

/**
 * @typedef {import("../../spec/transform").SortConfig} SortConfig
 */
export default class Collector extends FlowNode {
    /**
     * @param {SortConfig} params
     */
    constructor(params) {
        super();

        this.params = params;

        /** @type {any[]} */
        this.data = [];
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        this.data.push(datum);
    }

    complete() {
        const sort = this.params.sort;
        if (sort) {
            this.data.sort(compare(sort.field, sort.order));
        }

        if (this.children.length) {
            for (const datum of this.data) {
                this._propagate(datum);
            }
        }

        super.complete();
    }
}
