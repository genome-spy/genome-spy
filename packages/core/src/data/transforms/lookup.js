import { asArray } from "../../utils/arrayUtils.js";
import { field } from "../../utils/field.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/**
 * Extends primary data rows with values from a keyed foreign data table.
 */
export default class LookupTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /** @type {import("../collector.js").default} */
    #foreignCollector;

    /** @type {((datum: import("../flowNode.js").Datum) => any)[]} */
    #foreignKeyAccessors;

    /** @type {((datum: import("../flowNode.js").Datum) => any)[]} */
    #fieldAccessors;

    /** @type {((datum: import("../flowNode.js").Datum) => any)[] | undefined} */
    #valueAccessors;

    /** @type {string[]} */
    #as;

    #defaultValue;

    /**
     * Primary rows grouped by their input batches. Rows are retained only
     * until the foreign table first becomes available.
     *
     * @type {{flowBatch: import("../../types/flowBatch.js").FlowBatch | undefined, data: import("../flowNode.js").Datum[]}[]}
     */
    #primaryBatches = [];

    /**
     * @type {{flowBatch: import("../../types/flowBatch.js").FlowBatch | undefined, data: import("../flowNode.js").Datum[]} | undefined}
     */
    #currentBatch;

    #primaryCompleted = false;

    #completed = false;

    /** @type {Map<any, Map<any, any>> | null} */
    #index = null;

    /**
     * @param {import("../../spec/transform.js").LookupParams} params
     * @param {import("../collector.js").default} foreignCollector
     */
    constructor(params, foreignCollector) {
        super(params);

        this.params = params;
        this.#foreignCollector = foreignCollector;

        if (params.fields.length === 0) {
            throw new Error('The "fields" property must not be empty.');
        }

        const foreignKeyFields = asArray(params.from.key);
        if (foreignKeyFields.length !== params.fields.length) {
            throw new Error(
                'The "fields" and "from.key" properties must have the same number of fields.'
            );
        }

        const values = params.values;
        const as = params.as;
        if (values) {
            if (as && as.length !== values.length) {
                throw new Error(
                    'The "as" property must contain one output field for every lookup value.'
                );
            }
        } else if (!as || as.length !== 1) {
            throw new Error(
                'Lookup without "values" requires one output field in "as".'
            );
        }

        this.#foreignKeyAccessors = foreignKeyFields.map((name) => field(name));
        this.#fieldAccessors = params.fields.map((name) => field(name));
        this.#valueAccessors = values?.map((name) => field(name));
        this.#as = as ?? values ?? [];
        this.#defaultValue = params.default ?? null;

        this.registerDisposer(
            foreignCollector.observe(() => this.#flushWhenReady())
        );
    }

    reset() {
        super.reset();
        this.#primaryBatches = [];
        this.#currentBatch = undefined;
        this.#primaryCompleted = false;
        this.#completed = false;
        this.#index = null;
    }

    /**
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        if (this.#ensureIndex()) {
            super.beginBatch(flowBatch);
        } else {
            this.#currentBatch = { flowBatch, data: [] };
            this.#primaryBatches.push(this.#currentBatch);
        }
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        if (this.#ensureIndex()) {
            this.#propagateLookup(datum);
        } else if (!this.#currentBatch) {
            this.#currentBatch = { flowBatch: undefined, data: [] };
            this.#primaryBatches.push(this.#currentBatch);
            this.#currentBatch.data.push(datum);
        } else {
            this.#currentBatch.data.push(datum);
        }
    }

    complete() {
        this.#primaryCompleted = true;
        this.#flushWhenReady();
    }

    #flushWhenReady() {
        if (this.#ensureIndex()) {
            this.#propagateBufferedLookups();
            if (this.#primaryCompleted && !this.#completed) {
                this.#completed = true;
                super.complete();
            }
        }
    }

    #ensureIndex() {
        if (this.#index) {
            return true;
        }
        if (!this.#foreignCollector.completed) {
            return false;
        }

        this.#index = new Map();
        for (const foreignDatum of this.#foreignCollector.getData()) {
            const key = this.#foreignKeyAccessors.map((accessor) =>
                accessor(foreignDatum)
            );
            addToIndex(this.#index, key, foreignDatum, this.params.from.key);
        }

        return true;
    }

    #propagateBufferedLookups() {
        for (const { flowBatch, data } of this.#primaryBatches) {
            if (flowBatch) {
                for (const child of this.children) {
                    child.beginBatch(flowBatch);
                }
            }

            for (const primaryDatum of data) {
                this.#propagateLookup(primaryDatum);
            }
        }
        this.#primaryBatches = [];
        this.#currentBatch = undefined;
    }

    /**
     * @param {import("../flowNode.js").Datum} primaryDatum
     */
    #propagateLookup(primaryDatum) {
        const output = { ...primaryDatum };
        const key = this.#fieldAccessors.map((accessor) =>
            accessor(primaryDatum)
        );
        const foreignDatum = findFromIndex(
            /** @type {Map<any, Map<any, any>>} */ (this.#index),
            key
        );
        if (this.#valueAccessors) {
            for (let i = 0; i < this.#valueAccessors.length; i++) {
                output[this.#as[i]] = foreignDatum
                    ? this.#valueAccessors[i](foreignDatum)
                    : this.#defaultValue;
            }
        } else {
            output[this.#as[0]] = foreignDatum ?? this.#defaultValue;
        }
        this._propagate(output);
    }
}

/**
 * @param {Map<any, Map<any, any>>} index
 * @param {any[]} key
 * @param {import("../flowNode.js").Datum} datum
 * @param {import("../../spec/transform.js").Field | import("../../spec/transform.js").Field[]} keyFields
 */
function addToIndex(index, key, datum, keyFields) {
    /** @type {Map<any, any>} */
    let level = index;
    for (let i = 0; i < key.length - 1; i++) {
        const part = key[i];
        let next = level.get(part);
        if (!next) {
            next = new Map();
            level.set(part, next);
        }
        level = next;
    }

    const lastPart = key[key.length - 1];
    if (level.has(lastPart)) {
        throw new Error(
            `Duplicate lookup key ${JSON.stringify(key)} in fields ${JSON.stringify(keyFields)}.`
        );
    }
    level.set(lastPart, datum);
}

/**
 * @param {Map<any, Map<any, any>>} index
 * @param {any[]} key
 * @returns {import("../flowNode.js").Datum | undefined}
 */
function findFromIndex(index, key) {
    /** @type {Map<any, any>} */
    let level = index;
    for (let i = 0; i < key.length - 1; i++) {
        const next = level.get(key[i]);
        if (!next) {
            return;
        }
        level = next;
    }
    return level.get(key[key.length - 1]);
}
