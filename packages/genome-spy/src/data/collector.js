import { compare } from "vega-util";
import FlowNode from "./flowNode";

/**
 * @typedef {import("../spec/transform").SortConfig} SortConfig
 */
export default class Collector extends FlowNode {
    /**
     * @param {SortConfig} [params]
     */
    constructor(params) {
        super();

        this.params = params;

        /** @type {any[]} */
        this._data = [];
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        this._data.push(datum);
    }

    complete() {
        const sort = this.params?.sort;
        if (sort) {
            this._data.sort(compare(sort.field, sort.order));
        }

        if (this.children.length) {
            for (const datum of this._data) {
                this._propagate(datum);
            }
        }

        super.complete();
    }

    getData() {
        if (!this.completed) {
            throw new Error(
                "Data propagation is not completed! No data are available."
            );
        }
        return this._data;
    }
}
