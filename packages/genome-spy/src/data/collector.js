import { InternMap } from "internmap";
import { group } from "d3-array";
import { compare, field } from "vega-util";
import iterateNestedMaps from "../utils/iterateNestedMaps";
import FlowNode from "./flowNode";

/**
 * Collects (materializes) the data that flows through this node.
 * The collected data can be optionally grouped and sorted.
 *
 * Grouping is primarily intended for handling faceted data.
 *
 * @typedef {import("../spec/transform").CollectParams} CollectParams
 */
export default class Collector extends FlowNode {
    /**
     * @param {CollectParams} [params]
     */
    constructor(params) {
        super();

        this.params = params ?? { type: "collect" };

        /** @type {(function(Collector):void)[]} */
        this.observers = [];

        this._init();
    }

    _init() {
        /** @type {any[]} */
        this._data = [];

        /** @type {Map<any[], [number, number]>} */
        this.groupExtentMap = new InternMap([], JSON.stringify);
    }

    reset() {
        super.reset();
        this._init();
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
        const comparator = sort ? compare(sort.field, sort.order) : undefined;

        /** @param {any[]} data */
        const sortData = data => {
            if (comparator) {
                data.sort(comparator);
            }
        };

        if (this.params.groupby?.length) {
            const accessors = this.params.groupby.map(fieldName =>
                field(fieldName)
            );
            // @ts-ignore
            const groups = group(this._data, ...accessors);

            /** @type {any[]} */
            const concatenated = [];
            for (const [key, data] of iterateNestedMaps(groups)) {
                sortData(data);
                this.groupExtentMap.set(key, [
                    concatenated.length,
                    concatenated.length + data.length
                ]);
                concatenated.push(...data);
            }

            this._data = concatenated;
        } else {
            sortData(this._data);
        }

        if (this.children.length) {
            for (const datum of this._data) {
                this._propagate(datum);
            }
        }

        super.complete();

        for (const observer of this.observers) {
            observer(this);
        }
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
