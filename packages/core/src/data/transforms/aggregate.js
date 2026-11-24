import { InternMap } from "internmap";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import { findContiguousKey } from "../outputGrouping.js";
import Transform from "./transform.js";
import AGGREGATE_OPS from "./aggregateOps.js";

export default class AggregateTransform extends Transform {
    /** @type {string | null | undefined} */
    #streamKey;

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
                const op = AGGREGATE_OPS[params.ops[i]];
                this.ops.push((arr) => op(arr, accessor));
                this.as.push(
                    params.as
                        ? params.as[i]
                        : `${params.ops[i]}_${params.fields[i]}`
                );
            });
        } else {
            this.ops.push((arr) => AGGREGATE_OPS.count(arr));
            this.as.push("count");
        }
    }

    reset() {
        super.reset();
        this.buffer = [];
        this.#streamKey = undefined;
    }

    #flushRun() {
        if (!this.buffer.length) return;

        const key = this.buffer[0][this.#streamKey];
        // Map canonicalizes negative zero when retaining a group key.
        try {
            this.#emit(
                this.buffer,
                this.params.groupby,
                [key === 0 ? 0 : key],
                1
            );
        } finally {
            // A source may still complete after a downstream row error.
            this.buffer.length = 0;
        }
    }

    /**
     * Propagate the current buffer as one aggregated batch.
     */
    #flushBuffer() {
        if (this.#streamKey) {
            this.#flushRun();
            return;
        }

        const groupby = this.params.groupby ?? [];
        const data = groupby.length
            ? groupRows(
                  this.buffer,
                  this.createFieldAccessors(this.params, "groupby")
              )
            : this.buffer;
        this.#emit(data, groupby);
    }

    /**
     * Traverse groups in first-seen order, reusing the key path at every leaf.
     * @param {Map<any, any> | Datum[]} data
     * @param {string[]} groupby
     * @param {any[]} [path]
     * @param {number} [depth]
     */
    #emit(data, groupby, path = [], depth = 0) {
        if (data instanceof Map) {
            for (const [key, group] of data) {
                path[depth] = key;
                this.#emit(group, groupby, path, depth + 1);
            }
            return;
        }

        /** @type {Datum} */
        const datum = {};
        for (let i = 0; i < depth; i++) {
            datum[groupby[i]] = path[i];
        }
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
        if (this.#streamKey === undefined) {
            const groupby = this.params.groupby;
            this.#streamKey =
                (groupby?.length === 1 &&
                    findContiguousKey(
                        this.parent?.outputGrouping,
                        groupby
                    )?.[0]) ||
                null;
        }
        const first = this.buffer[0];
        if (
            this.#streamKey &&
            first &&
            first[this.#streamKey] !== datum[this.#streamKey]
        ) {
            this.#flushRun();
        }
        this.buffer.push(datum);
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
        if (this.buffer.length > 0 || this.inFacet) {
            this.#flushBuffer();
            this.buffer = [];
        }

        super.beginBatch(flowBatch);
    }

    complete() {
        this.#flushBuffer();
        this.#streamKey = undefined;

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

    const hasChildren = depth + 1 < accessors.length;
    // InternMap repeats key interning on the final write, even for leaves.
    if (hasChildren || groups instanceof InternMap) {
        for (const [key, group] of groups) {
            groups.set(
                key,
                hasChildren ? groupRows(group, accessors, depth + 1) : group
            );
        }
    }
    return groups;
}
