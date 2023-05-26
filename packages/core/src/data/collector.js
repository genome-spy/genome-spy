import { InternMap } from "internmap";
import { group } from "d3-array";
import { compare } from "vega-util";
import iterateNestedMaps from "../utils/iterateNestedMaps";
import FlowNode, { BEHAVIOR_COLLECTS, isFacetBatch } from "./flowNode";
import { field } from "../utils/field";
import { asArray } from "../utils/arrayUtils";

/**
 * Collects (materializes) the data that flows through this node.
 * The collected data can be optionally grouped and sorted.
 *
 * Grouping is primarily intended for handling faceted data.
 *
 * @typedef {import("../spec/transform").CollectParams} CollectParams
 * @typedef {import("./flowNode").Data} Data
 */
export default class Collector extends FlowNode {
    get behavior() {
        return BEHAVIOR_COLLECTS;
    }

    /**
     * @param {CollectParams} [params]
     */
    constructor(params) {
        super();

        this.params = params ?? { type: "collect" };

        /** @type {(function(Collector):void)[]} */
        this.observers = [];

        /** @type {Map<any | any[], Data>} TODO: proper type for key */
        this.facetBatches = undefined;

        this._init();
    }

    _init() {
        /** @type {Data} */
        this._data = [];

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
     * @param {import("./flowNode").Datum} datum
     */
    handle(datum) {
        this._data.push(datum);
    }

    /**
     * @param {import("../types/flowBatch").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        if (isFacetBatch(flowBatch)) {
            this._data = [];
            this.facetBatches.set(asArray(flowBatch.facetId), this._data);
        }
    }

    complete() {
        const sort = this.params?.sort;
        // Vega's "compare" function is incredibly slow (uses megamorphic field accessor)
        // TODO: Implement a replacement for static data types
        const comparator = sort ? compare(sort.field, sort.order) : undefined;

        /** @param {any[]} data */
        const sortData = (data) => {
            if (comparator) {
                data.sort(comparator);
            }
        };

        if (this.params.groupby?.length) {
            if (this.facetBatches.size > 1) {
                throw new Error("TODO: Support faceted data!");
            }

            const accessors = this.params.groupby.map((fieldName) =>
                field(fieldName)
            );
            // @ts-ignore
            const groups = group(this._data, ...accessors);

            this.facetBatches.clear();
            for (const [key, data] of iterateNestedMaps(groups)) {
                this.facetBatches.set(key, data);
            }
        }

        for (const data of this.facetBatches.values()) {
            // TODO: Only sort if not already sorted
            sortData(data);
        }

        if (this.children.length) {
            for (const [key, data] of this.facetBatches.entries()) {
                if (key) {
                    /** @type {import("../types/flowBatch").FacetBatch} */
                    const facetBatch = { type: "facet", facetId: key };
                    for (const child of this.children) {
                        child.beginBatch(facetBatch);
                    }
                }
                for (const datum of data) {
                    this._propagate(datum);
                }
            }
        }

        super.complete();

        for (const observer of this.observers) {
            observer(this);
        }
    }

    /**
     * @returns {Iterable<import("./flowNode").Datum>}
     */
    getData() {
        this._checkStatus();

        switch (this.facetBatches.size) {
            case 0:
                return [];
            case 1:
                return [...this.facetBatches.values()][0];
            default: {
                const groups = this.facetBatches;
                return {
                    [Symbol.iterator]: function* generator() {
                        for (const data of groups.values()) {
                            for (let i = 0; i < data.length; i++) {
                                yield data[i];
                            }
                        }
                    },
                };
            }
        }
    }

    /**
     *
     * @param {(datum: import("./flowNode").Datum) => void} visitor
     */
    visitData(visitor) {
        this._checkStatus();

        for (const data of this.facetBatches.values()) {
            for (let i = 0; i < data.length; i++) {
                visitor(data[i]);
            }
        }
    }

    /**
     * Returns the total number of data items collected.
     */
    getItemCount() {
        let count = 0;
        for (const data of this.facetBatches.values()) {
            count += data.length;
        }
        return count;
    }

    _checkStatus() {
        if (!this.completed) {
            throw new Error(
                "Data propagation is not completed! No data are available."
            );
        }
    }
}
