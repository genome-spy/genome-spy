import { InternMap } from "internmap";
import { group } from "d3-array";
import { compare } from "vega-util";
import iterateNestedMaps from "../utils/iterateNestedMaps.js";
import FlowNode, { BEHAVIOR_COLLECTS, isFacetBatch } from "./flowNode.js";
import { field } from "../utils/field.js";
import { asArray } from "../utils/arrayUtils.js";

/**
 * Collects (materializes) the data that flows through this node.
 * The collected data can be optionally grouped and sorted.
 *
 * Grouping is primarily intended for handling faceted data.
 */
export default class Collector extends FlowNode {
    /**
     * @typedef {import("./flowNode.js").Datum} Datum
     * @typedef {import("./flowNode.js").Data} Data
     */

    /**
     * Current batch that is being collected.
     * @type {Data}
     */
    #buffer = [];

    /** */
    get behavior() {
        return BEHAVIOR_COLLECTS;
    }

    /**
     * @param {import("../spec/transform.js").CollectParams} [params]
     */
    constructor(params) {
        super();

        this.params = params ?? { type: "collect" };

        /** @type {(function(Collector):void)[]} */
        this.observers = [];

        // TODO: Consider nested maps instead of InternMap
        /** @type {Map<import("../spec/channel.js").Scalar[], Data>} TODO: proper type for key */
        this.facetBatches = new InternMap([], JSON.stringify);

        this.#init();
    }

    #init() {
        this.#buffer = [];

        this.facetBatches.clear();
        this.facetBatches.set(undefined, this.#buffer);
    }

    reset() {
        super.reset();
        this.#init();
    }

    /**
     * @param {Datum} datum
     */
    handle(datum) {
        this.#buffer.push(datum);
    }

    /**
     * @param {import("../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        if (isFacetBatch(flowBatch)) {
            this.#buffer = [];
            this.facetBatches.set(asArray(flowBatch.facetId), this.#buffer);
        }
    }

    complete() {
        // Free some memory
        this.#buffer = [];

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

            const data = this.facetBatches.get(undefined);

            const accessors = this.params.groupby.map((fieldName) =>
                field(fieldName)
            );
            const groups =
                accessors.length > 1
                    ? // There's something strange in d3-array's typings
                      /** @type {Map<any, any>} */ /** @type {any} */ (
                          group(data, ...accessors)
                      )
                    : // D3's group is SLOW!
                      groupBy(data, accessors[0]);

            this.facetBatches.clear();
            for (const [key, data] of iterateNestedMaps(groups)) {
                this.facetBatches.set(key, data);
            }
        }

        for (const data of this.facetBatches.values()) {
            // TODO: Only sort if not already sorted
            sortData(data);
        }

        this.#propagateToChildren();

        super.complete();

        for (const observer of this.observers) {
            observer(this);
        }
    }

    #propagateToChildren() {
        if (this.children.length) {
            for (const [key, data] of this.facetBatches.entries()) {
                if (key) {
                    /** @type {import("../types/flowBatch.js").FacetBatch} */
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
    }

    repropagate() {
        for (const child of this.children) {
            child.reset();
        }

        this.#propagateToChildren();

        for (const child of this.children) {
            child.complete();
        }
    }

    /**
     * @returns {Iterable<Datum>}
     */
    getData() {
        this.#checkStatus();

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
     * @param {(datum: Datum) => void} visitor
     */
    visitData(visitor) {
        this.#checkStatus();

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

    #checkStatus() {
        if (!this.completed) {
            throw new Error(
                "Data propagation is not completed! No data are available."
            );
        }
    }
}

/**
 * Like D3's group but without InternMap, which is slow.
 * TODO: Implement multi-level grouping
 *
 * @param {Datum[]} data
 * @param {(data: Datum) => import("../spec/channel.js").Scalar} accessor
 */
function groupBy(data, accessor) {
    const groups = new Map();
    for (let i = 0, n = data.length; i < n; i++) {
        const datum = data[i];
        const key = accessor(datum);
        let group = groups.get(key);
        if (!group) {
            group = [];
            groups.set(key, group);
        }
        group.push(datum);
    }
    return groups;
}
