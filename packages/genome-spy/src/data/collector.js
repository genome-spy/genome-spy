import { InternMap } from "internmap";
import { group } from "d3-array";
import { compare } from "vega-util";
import iterateNestedMaps from "../utils/iterateNestedMaps";
import FlowNode, { isFacetBatch } from "./flowNode";
import { field } from "../utils/field";
import { asArray } from "../utils/arrayUtils";

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

        /** @type {Map<any[], [number, number]>} */
        this.groupExtentMap = undefined;

        /** @type {Map<any | any[], any[]>} */
        this.facetBatches = undefined;

        this._init();
    }

    _init() {
        /** @type {any[]} */
        this._data = [];

        this.groupExtentMap = new InternMap([], JSON.stringify);

        // TODO: Consider nested maps
        this.facetBatches = new InternMap([], JSON.stringify);
        this.facetBatches.set(undefined, this._data);
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

    /**
     * @param {import("./flowBatch").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        // TODO: Propagate batches to children(?)

        if (isFacetBatch(flowBatch)) {
            this._data = [];
            this.facetBatches.set(asArray(flowBatch.facetId), this._data);
        }
    }

    complete() {
        const sort = this.params?.sort;
        // Vega's "compare" function is in incredibly slow
        // TODO: Implement a replacement for static data types
        const comparator = sort ? compare(sort.field, sort.order) : undefined;

        /** @param {any[]} data */
        const sortData = data => {
            if (comparator) {
                data.sort(comparator);
            }
        };

        if (this.params.groupby?.length) {
            if (this.facetBatches.size > 1) {
                throw new Error("TODO: Support faceted data!");
            }

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
            const concatenated = [];
            for (const [key, data] of this.facetBatches.entries()) {
                sortData(data);
                this.groupExtentMap.set(key, [
                    concatenated.length,
                    concatenated.length + data.length
                ]);

                // TODO: Skip unnecessary copying if there's only a single facet or group
                for (let i = 0; i < data.length; i++) {
                    concatenated.push(data[i]);
                }
            }

            this._data = concatenated;
        }

        // Free some memory
        this.facetBatches = undefined;

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
