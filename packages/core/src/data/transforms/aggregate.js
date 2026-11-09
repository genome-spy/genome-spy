import { InternMap } from "internmap";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import iterateNestedMaps from "../../utils/iterateNestedMaps.js";
import Transform from "./transform.js";
import AGGREGATE_OPS from "./aggregateOps.js";

export default class AggregateTransform extends Transform {
    /** @type {boolean} */
    #streamCount;

    #count = 0;

    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").AggregateParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     *
     * @typedef {import("../flowNode.js").Datum} Datum
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);
        this.params = params;

        /** @type {Datum[]} */
        this.buffer = [];

        /**
         * @type {((arr: Datum[]) => number)[]}
         */
        this.ops = [];
        /**
         * @type {string[]}
         */
        this.as = [];

        let countOnly = true;
        if (params.fields) {
            if (params.fields.length != params.ops.length) {
                throw new Error("Fields and ops must have the same length!");
            }

            if (params.as && params.as.length != params.ops.length) {
                throw new Error(
                    'If "as" is defined, "fields" and "as" must have the same length!'
                );
            }

            params.fields.forEach((_, i) => {
                const accessor = this.createFieldAccessor(params, "fields", {
                    index: i,
                });
                const name = params.ops[i];
                const op = AGGREGATE_OPS[name];
                countOnly &&= name === "count";
                this.ops.push((arr) => op(arr, accessor));
                this.as.push(
                    params.as ? params.as[i] : `${name}_${params.fields[i]}`
                );
            });
        } else {
            this.ops.push((arr) => AGGREGATE_OPS.count(arr));
            this.as.push("count");
        }

        this.#streamCount = countOnly && !params.groupby?.length;
    }

    reset() {
        super.reset();
        this.buffer = [];
        this.#count = 0;
    }

    /**
     * Propagate the current buffer as one aggregated batch.
     */
    #flushBuffer() {
        const params = this.params;
        const groupby = params.groupby;

        if (this.#streamCount) {
            /** @type {Datum} */
            const datum = {};
            for (const name of this.as) {
                datum[name] = this.#count;
            }
            this._propagate(datum);
            return;
        }

        if (groupby?.length > 0) {
            const groupFieldAccessors = this.createFieldAccessors(
                params,
                "groupby"
            );

            const groups = groupRows(this.buffer, groupFieldAccessors);

            if (groupby.length === 1) {
                const field = groupby[0];
                for (const [key, data] of groups) {
                    // Assign like the multi-key path, including special names.
                    /** @type {Datum} */
                    const datum = {};
                    datum[field] = key;
                    this.#propagateAggregate(datum, data);
                }
                return;
            }

            for (const [group, data] of iterateNestedMaps(groups)) {
                /** @type {Datum} */
                const datum = {};

                for (let i = 0; i < groupby.length; i++) {
                    datum[groupby[i]] = group[i];
                }

                this.#propagateAggregate(datum, data);
            }
        } else {
            this.#propagateAggregate({}, this.buffer);
        }
    }

    /**
     * @param {Datum} datum
     * @param {Datum[]} data
     */
    #propagateAggregate(datum, data) {
        for (let i = 0; i < this.ops.length; i++) {
            datum[this.as[i]] = this.ops[i](data);
        }

        this._propagate(datum);
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        if (this.#streamCount) {
            this.#count++;
        } else {
            this.buffer.push(datum);
        }
    }

    /**
     * Flush the current batch before downstream nodes switch to a new facet.
     *
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        // Physical files do not partition a logical reduction. Summary rows
        // also have their own homogeneous shape, independent of file provenance.
        if (flowBatch.type == "file") {
            return;
        }
        if (this.#count > 0 || this.buffer.length > 0 || this.inFacet) {
            this.#flushBuffer();
            this.buffer = [];
            this.#count = 0;
        }

        super.beginBatch(flowBatch);
    }

    complete() {
        this.#flushBuffer();

        super.complete();
    }
}

/**
 * Group one level at a time to preserve the first-seen order of nested keys.
 * @param {Datum[]} rows
 * @param {((datum: Datum) => any)[]} accessors
 * @param {number} [depth]
 * @returns {Map<any, any>}
 */
function groupRows(rows, accessors, depth = 0) {
    let groups = new Map();
    const accessor = accessors[depth];
    for (const row of rows) {
        const key = accessor(row);
        // Primitive keys can use Map directly. Object keys still use d3's
        // valueOf interning, including collisions with earlier primitive keys.
        if (
            key !== null &&
            typeof key === "object" &&
            !(groups instanceof InternMap)
        ) {
            groups = new InternMap(Array.from(groups));
        }
        const group = groups.get(key);
        if (group) {
            group.push(row);
        } else {
            groups.set(key, [row]);
        }
    }

    const nextDepth = depth + 1;
    if (nextDepth < accessors.length) {
        for (const [key, group] of groups) {
            groups.set(key, groupRows(group, accessors, nextDepth));
        }
    } else if (groups instanceof InternMap) {
        // Match d3.group's final write, which may re-intern object keys.
        for (const [key, group] of groups) {
            groups.set(key, group);
        }
    }
    return groups;
}
