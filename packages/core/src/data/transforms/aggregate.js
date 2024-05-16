import { group as d3group } from "d3-array";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import { field } from "../../utils/field.js";
import iterateNestedMaps from "../../utils/iterateNestedMaps.js";
import Transform from "./transform.js";
import AGGREGATE_OPS from "./aggregateOps.js";

export default class AggregateTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").AggregateParams} params
     *
     * @typedef {import("../flowNode.js").Datum} Datum
     */
    constructor(params) {
        super();
        this.params = params;

        /** @type {any[]} */
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

            params.fields.forEach((fieldName, i) => {
                const accessor = field(fieldName);
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
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.buffer.push(datum);
    }

    complete() {
        const params = this.params;

        const groupby = params?.groupby;

        if (groupby?.length > 0) {
            const groupFieldAccessors = groupby.map((f) => field(f));

            // There's something strange in d3-array's typings
            const groups = /** @type {Map<any, any>} */ /** @type {any} */ (
                d3group(this.buffer, ...groupFieldAccessors)
            );

            for (const [group, data] of iterateNestedMaps(groups)) {
                /** @type {any} */
                const datum = {};

                for (let i = 0; i < groupby.length; i++) {
                    datum[groupby[i]] = group[i];
                }

                this.ops.forEach((op, i) => {
                    datum[this.as[i]] = op(data);
                });

                this._propagate(datum);
            }
        } else {
            /** @type {Datum} */
            const datum = {};
            this.ops.forEach((op, i) => {
                datum[this.as[i]] = op(this.buffer);
            });

            this._propagate(datum);
        }

        super.complete();
    }
}
