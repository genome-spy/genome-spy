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

    /** @type {import("../flowNode.js").Datum[]} */
    #primaryData = [];

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

        this.registerDisposer(
            foreignCollector.observe(() => this.#rejoinForeignData())
        );
    }

    reset() {
        super.reset();
        this.#primaryData = [];
        this.#primaryCompleted = false;
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.#primaryData.push(datum);
    }

    complete() {
        this.#primaryCompleted = true;
        if (this.#foreignCollector.completed) {
            this.#propagateLookups();
            super.complete();
        }
    }

    #rejoinForeignData() {
        if (this.#primaryCompleted) {
            for (const child of this.children) {
                child.reset();
            }
            this.#propagateLookups();
            for (const child of this.children) {
                child.complete();
            }
        }
    }

    #propagateLookups() {
        const params = this.params;
        const keyAccessors = asArray(params.from.key).map((name) =>
            field(name)
        );
        const fieldAccessors = params.fields.map((name) => field(name));
        const valueAccessors = params.values?.map((name) => field(name));
        const as = params.as ?? params.values;
        if (!as) {
            throw new Error("Invalid lookup output field configuration.");
        }
        const defaultValue = params.default ?? null;

        /** @type {Map<any, Map<any, any>>} */
        const index = new Map();
        for (const foreignDatum of this.#foreignCollector.getData()) {
            const key = keyAccessors.map((accessor) => accessor(foreignDatum));
            addToIndex(index, key, foreignDatum, params.from.key);
        }

        for (const primaryDatum of this.#primaryData) {
            const output = { ...primaryDatum };
            const key = fieldAccessors.map((accessor) =>
                accessor(primaryDatum)
            );
            const foreignDatum = findFromIndex(index, key);
            if (valueAccessors) {
                for (let i = 0; i < valueAccessors.length; i++) {
                    output[as[i]] = foreignDatum
                        ? valueAccessors[i](foreignDatum)
                        : defaultValue;
                }
            } else {
                output[as[0]] = foreignDatum ?? defaultValue;
            }
            this._propagate(output);
        }
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

/**
 * @param {T | T[]} value
 * @template T
 * @returns {T[]}
 */
function asArray(value) {
    return Array.isArray(value) ? value : [value];
}
