import { asArray } from "../../utils/arrayUtils.js";
import { field } from "../../utils/field.js";
import Collector from "../collector.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import DataSource from "../sources/dataSource.js";
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

    /** @type {Map<any, Map<any, any>> | null} */
    #index = null;

    #primaryCompleted = false;

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
            foreignCollector.observe(() => this.#reloadPrimaryData())
        );
    }

    reset() {
        super.reset();
        this.#index = null;
        this.#primaryCompleted = false;
    }

    /**
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        this.#ensureIndex();
        super.beginBatch(flowBatch);
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.#ensureIndex();
        this.#propagateLookup(datum);
    }

    complete() {
        this.#primaryCompleted = true;
        super.complete();
    }

    /**
     * Replays primary data after the lookup table has completed a reload.
     * A collector upstream of lookup already materializes the primary rows;
     * otherwise the primary source must load them again.
     */
    #reloadPrimaryData() {
        if (!this.#primaryCompleted) {
            return;
        }

        let node = this.parent;
        while (node) {
            if (node instanceof Collector || node instanceof DataSource) {
                node.repropagate();
                return;
            }
            node = node.parent;
        }

        // Standalone transforms used outside a data flow have no replay point.
    }

    #ensureIndex() {
        if (this.#index) {
            return;
        }
        if (!this.#foreignCollector.completed) {
            throw new Error("Lookup table must be loaded before primary data.");
        }

        this.#index = new Map();
        for (const foreignDatum of this.#foreignCollector.getData()) {
            const key = this.#foreignKeyAccessors.map((accessor) =>
                accessor(foreignDatum)
            );
            addToIndex(this.#index, key, foreignDatum, this.params.from.key);
        }
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
