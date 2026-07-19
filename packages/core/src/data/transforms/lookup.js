import { asArray } from "../../utils/arrayUtils.js";
import createCloner from "../../utils/cloner.js";
import { field } from "../../utils/field.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/** @typedef {import("../flowNode.js").Datum} Datum */
/** @typedef {(datum: Datum) => any} FieldAccessor */
/** @typedef {(output: Datum, foreignDatum: Datum | undefined) => void} LookupWriter */
/**
 * @typedef {object} LookupOptions
 * @prop {() => boolean} [isForeignDataReady]
 * @prop {() => void} [requestForeignData]
 * @prop {() => void} [prepareBatch]
 * @prop {(datum: Datum) => boolean} [acceptsDatum]
 */

/**
 * Extends primary rows with values from an exact keyed side input.
 * CoordinateLookupTransform inherits this implementation to add lazy
 * readiness and coverage behavior.
 */
export default class LookupTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").LookupParams | import("../../spec/transform.js").CoordinateLookupParams} params
     * @param {import("../collector.js").default} foreignCollector
     * @param {LookupOptions} [options]
     */
    constructor(params, foreignCollector, options = {}) {
        super(params);
        this.params = params;
        const foreignKeyFields = /** @type {string[]} */ (asArray(params.key));
        const primaryFields = /** @type {string[]} */ (
            asArray(params.fields ?? foreignKeyFields)
        );
        if (primaryFields.length === 0) {
            throw new Error('The "fields" property must not be empty.');
        }
        if (foreignKeyFields.length !== primaryFields.length) {
            throw new Error(
                'The "fields" and "key" properties must have the same number of fields.'
            );
        }

        const values = params.values;
        const as = params.as;
        if (!values && as) {
            throw new Error('The "as" property requires explicit "values".');
        }
        if (values && as && as.length !== values.length) {
            throw new Error(
                'The "as" property must contain one output field for every lookup value.'
            );
        }
        if (values?.length === 0) {
            throw new Error('The "values" property must not be empty.');
        }

        const foreignKeyAccessors = foreignKeyFields.map((name) => field(name));
        const primaryAccessors = primaryFields.map((name) => field(name));
        const implicitValues = !values;
        let valueAccessors = values?.map((name) => field(name)) ?? [];
        let outputFields = as ?? values ?? [];
        const defaultValue = params.default ?? null;
        let primaryCompleted = false;

        /** @type {(datum: Datum) => Datum} */
        let clone;
        /** @type {Map<any, any> | null} */
        let index = null;
        /** @type {LookupWriter} */
        let writeValues;

        const firstAccessor = primaryAccessors[0];
        const isForeignDataReady = options.isForeignDataReady ?? (() => true);
        const requestForeignData =
            options.requestForeignData ?? (() => undefined);
        const prepareBatch = options.prepareBatch ?? (() => undefined);
        const hasDatumFilter = !!options.acceptsDatum;
        const acceptsDatum = options.acceptsDatum ?? (() => true);

        // Select the common single-key path once instead of branching per row.
        /** @type {(datum: Datum) => Datum | undefined} */
        const findForeignDatum =
            foreignKeyFields.length === 1
                ? (datum) =>
                      /** @type {Map<any, Datum>} */ (index).get(
                          firstAccessor(datum)
                      )
                : (datum) => {
                      /** @type {Map<any, Map<any, any>>} */
                      let level = index;
                      for (let i = 0; i < primaryAccessors.length - 1; i++) {
                          const next = level.get(primaryAccessors[i](datum));
                          if (!next) {
                              return;
                          }
                          level = next;
                      }
                      return level.get(primaryAccessors.at(-1)(datum));
                  };

        const ensureIndex = () => {
            prepareBatch();
            if (index) {
                return;
            }
            if (!foreignCollector.completed) {
                throw new Error(
                    "Lookup table must be loaded before primary data."
                );
            }

            const foreignData = foreignCollector.getData();
            if (implicitValues) {
                const resolved = resolveImplicitValues(
                    foreignData[Symbol.iterator]().next().value,
                    foreignKeyFields
                );
                outputFields = resolved;
                valueAccessors = resolved.map((name) => field(name));
            }

            index = buildLookupIndex(
                foreignData,
                foreignKeyAccessors,
                params.key
            );
            writeValues = createLookupWriter(
                outputFields,
                valueAccessors,
                defaultValue
            );
        };

        /** @param {Datum} datum */
        const propagateLookup = (datum) => {
            const output = clone(datum);
            const foreignDatum = findForeignDatum(datum);
            writeValues(output, foreignDatum);
            this._propagate(output);
        };

        /** @param {Datum} datum */
        const propagateAcceptedLookup = (datum) => {
            if (acceptsDatum(datum)) {
                propagateLookup(datum);
            }
        };

        const propagate = hasDatumFilter
            ? propagateAcceptedLookup
            : propagateLookup;

        /**
         * Validates the first datum and installs a fixed output writer. Dataflow
         * batches have a stable input shape, as required by the cached cloner.
         *
         * @param {Datum} datum
         */
        const specializeAndPropagate = (datum) => {
            ensureIndex();
            for (const name of outputFields) {
                if (Object.hasOwn(datum, name)) {
                    throw new Error(
                        `Lookup output field "${name}" already exists in primary data.`
                    );
                }
            }

            clone = createCloner(datum);
            // Subsequent rows use the indexed handler directly.
            this.handle = propagate;
            propagate(datum);
        };

        const invalidateIndex = () => {
            index = null;
            if (implicitValues) {
                // The refreshed table may expose a different set of output fields.
                valueAccessors = [];
                outputFields = [];
            }
            this.handle = specializeAndPropagate;
        };

        /**
         * Replays primary data after the lookup table has completed a reload.
         */
        const reloadPrimaryData = () => {
            if (primaryCompleted && this.parent) {
                this.repropagate();
            }
        };

        this.registerDisposer(
            foreignCollector.observe(() => {
                // Keep the index for primary-only reloads, but rebuild it when
                // the lookup table itself has changed.
                invalidateIndex();
                reloadPrimaryData();
            })
        );

        const reset = this.reset.bind(this);
        this.reset = () => {
            reset();
            primaryCompleted = false;
            // The cached table index remains valid until the foreign collector updates.
            this.handle = specializeAndPropagate;
        };

        const beginBatch = this.beginBatch.bind(this);
        /** @param {import("../../types/flowBatch.js").FlowBatch} flowBatch */
        this.beginBatch = (flowBatch) => {
            if (isForeignDataReady()) {
                ensureIndex();
                this.handle = specializeAndPropagate;
            } else {
                requestForeignData();
                this.handle = discardDatum;
            }
            beginBatch(flowBatch);
        };

        const complete = this.complete.bind(this);
        this.complete = () => {
            primaryCompleted = true;
            complete();
        };

        this.handle = specializeAndPropagate;
    }
}

/** @param {Datum} _datum */
function discardDatum(_datum) {}

/**
 * @param {Iterable<Datum>} foreignData
 * @param {FieldAccessor[]} accessors
 * @param {import("../../spec/transform.js").Field | import("../../spec/transform.js").Field[]} keyFields
 * @returns {Map<any, any>}
 */
function buildLookupIndex(foreignData, accessors, keyFields) {
    const index = new Map();
    if (accessors.length === 1) {
        // A single key maps directly to its table row.
        const accessor = accessors[0];
        for (const foreignDatum of foreignData) {
            const key = accessor(foreignDatum);
            if (index.has(key)) {
                throw new Error(
                    `Duplicate lookup key ${JSON.stringify([key])} in fields ${JSON.stringify(keyFields)}.`
                );
            }
            index.set(key, foreignDatum);
        }
    } else {
        // Nested maps preserve each composite-key component's type.
        for (const foreignDatum of foreignData) {
            /** @type {Map<any, any>} */
            let level = index;
            for (let i = 0; i < accessors.length - 1; i++) {
                const key = accessors[i](foreignDatum);
                let next = level.get(key);
                if (!next) {
                    next = new Map();
                    level.set(key, next);
                }
                level = next;
            }

            const key = accessors.at(-1)(foreignDatum);
            if (level.has(key)) {
                const duplicateKey = accessors.map((accessor) =>
                    accessor(foreignDatum)
                );
                throw new Error(
                    `Duplicate lookup key ${JSON.stringify(duplicateKey)} in fields ${JSON.stringify(keyFields)}.`
                );
            }
            level.set(key, foreignDatum);
        }
    }
    return index;
}

/**
 * @param {Datum | undefined} foreignDatum
 * @param {string[]} keyFields
 * @returns {string[]}
 */
function resolveImplicitValues(foreignDatum, keyFields) {
    if (!foreignDatum) {
        return [];
    }
    const fieldNames = Object.keys(foreignDatum);
    const nestedKeyFields = keyFields.filter(
        (name) => !fieldNames.includes(name)
    );
    if (nestedKeyFields.length) {
        throw new Error(
            'Omitting "values" requires top-level lookup key fields.'
        );
    }
    return fieldNames.filter((name) => !keyFields.includes(name));
}

/**
 * @param {string[]} outputFields
 * @param {FieldAccessor[]} valueAccessors
 * @param {any} defaultValue
 * @returns {LookupWriter}
 */
function createLookupWriter(outputFields, valueAccessors, defaultValue) {
    const properties = outputFields.map((name) => JSON.stringify(name));
    const defaultLiteral = JSON.stringify(defaultValue);
    const matchedAssignments = properties
        .map((name, i) => `output[${name}] = accessors[${i}](foreignDatum);`)
        .join("\n");
    const defaultAssignments = properties
        .map((name) => `output[${name}] = ${defaultLiteral};`)
        .join("\n");
    return /** @type {LookupWriter} */ (
        new Function(
            "accessors",
            `return (output, foreignDatum) => {
                if (foreignDatum) {
                    ${matchedAssignments}
                } else {
                    ${defaultAssignments}
                }
            };`
        )(valueAccessors)
    );
}
