import { asArray } from "../../utils/arrayUtils.js";
import createCloner from "../../utils/cloner.js";
import { field } from "../../utils/field.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/** @typedef {import("../flowNode.js").Datum} Datum */
/** @typedef {(datum: Datum) => any} FieldAccessor */
/** @typedef {(output: Datum, foreignDatum: Datum | undefined) => void} LookupWriter */
/** @typedef {import("../../types/flowBatch.js").FlowBatch} FlowBatch */
/**
 * @typedef {object} LookupOptions
 * @prop {() => boolean} [isForeignDataReady]
 * @prop {() => void} [requestForeignData]
 * @prop {() => void} [prepareBatch]
 * @prop {(datum: Datum) => boolean} [acceptsDatum]
 */

/**
 * Extends primary rows with values from an exact keyed lookup table.
 * CoordinateLookupTransform inherits this implementation to add lazy
 * readiness and coverage behavior.
 */
export default class LookupTransform extends Transform {
    /** @type {import("../collector.js").default | undefined} */
    #foreignCollector;

    #consumedForeignRevision = -1;

    get dataDependencies() {
        return this.#foreignCollector ? [this.#foreignCollector] : [];
    }

    isDataReady() {
        return (
            super.isDataReady() &&
            (!this.#foreignCollector ||
                (this.#foreignCollector.completed &&
                    this.#consumedForeignRevision ===
                        this.#foreignCollector.dataRevision))
        );
    }

    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").LookupParams | import("../../spec/transform.js").CoordinateLookupParams} params
     * @param {import("../collector.js").default} [foreignCollector]
     * @param {LookupOptions} [options]
     */
    constructor(params, foreignCollector, options = {}) {
        super(params);
        this.#foreignCollector = foreignCollector;
        this.params = params;
        const selfInput = isSelfLookup(params);
        if (!selfInput && !foreignCollector) {
            throw new Error("Lookup transform requires a foreign collector.");
        }
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
        let pendingInput = false;
        let evaluatedRevision = -1;
        let indexRevision = -1;
        // Self-input rows must wait for their group to end so forward
        // references can be resolved.
        /** @type {Datum[]} */
        let bufferedData = [];
        /** @type {FlowBatch | undefined} */
        let bufferedBatch;
        let hasBufferedBatch = false;

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
        // Coordinate lookup uses this to omit rows outside loaded coverage.
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

        /**
         * @param {Iterable<Datum>} [lookupData]
         */
        const ensureIndex = (lookupData) => {
            prepareBatch();
            if (
                foreignCollector &&
                indexRevision !== foreignCollector.dataRevision
            ) {
                index = null;
            }
            if (index) {
                evaluatedRevision = indexRevision;
                return;
            }
            if (!lookupData && !foreignCollector.completed) {
                throw new Error(
                    "Lookup table must be loaded before primary data."
                );
            }

            const foreignData = lookupData ?? foreignCollector.getData();
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
            if (foreignCollector) {
                indexRevision = foreignCollector.dataRevision;
                evaluatedRevision = indexRevision;
            }
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

        // Keep eager lookup's per-row path free of the optional predicate.
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
            // Collector replay need not emit beginBatch(). Check once before
            // installing the per-row fast path, just as for an ordinary batch.
            if (!isForeignDataReady()) {
                requestForeignData();
                if (!isForeignDataReady()) {
                    pendingInput = true;
                    this.handle = discardDatum;
                    return;
                }
            }
            ensureIndex();
            // Implicit self lookup copies fields already present in the input
            // record, but still writes them only to its clone.
            if (!(selfInput && implicitValues)) {
                for (const name of outputFields) {
                    if (Object.hasOwn(datum, name)) {
                        throw new Error(
                            `Lookup output field "${name}" already exists in primary data.`
                        );
                    }
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

        if (foreignCollector) {
            this.registerDisposer(
                foreignCollector.observe(() => {
                    // Keep the index for primary-only reloads, but rebuild it when
                    // the lookup table itself has changed.
                    invalidateIndex();
                    reloadPrimaryData();
                })
            );
        }

        /**
         * Builds one batch-local index and replays the batch in input order.
         */
        const flushBufferedBatch = () => {
            ensureIndex(bufferedData);
            this.handle = specializeAndPropagate;
            clone = undefined;
            if (hasBufferedBatch) {
                // Forward the delayed boundary immediately before its rows.
                beginBatch(/** @type {FlowBatch} */ (bufferedBatch));
            }
            for (const datum of bufferedData) {
                this.handle(datum);
            }

            bufferedData = [];
            bufferedBatch = undefined;
            hasBufferedBatch = false;
            index = null;
            if (implicitValues) {
                valueAccessors = [];
                outputFields = [];
            }
            this.handle = bufferDatum;
        };

        /** @param {Datum} datum */
        function bufferDatum(datum) {
            bufferedData.push(datum);
        }

        const reset = this.reset.bind(this);
        this.reset = () => {
            reset();
            this.#consumedForeignRevision = -1;
            pendingInput = false;
            evaluatedRevision = -1;
            primaryCompleted = false;
            clone = undefined;
            if (selfInput) {
                bufferedData = [];
                bufferedBatch = undefined;
                hasBufferedBatch = false;
                index = null;
                if (implicitValues) {
                    valueAccessors = [];
                    outputFields = [];
                }
                this.handle = bufferDatum;
            } else {
                // The cached table index remains valid until the foreign collector updates.
                this.handle = specializeAndPropagate;
            }
        };

        const beginBatch = this.beginBatch.bind(this);
        /** @param {FlowBatch} flowBatch */
        this.beginBatch = (flowBatch) => {
            if (selfInput) {
                // A new boundary proves that the preceding group is complete.
                if (hasBufferedBatch || bufferedData.length > 0) {
                    flushBufferedBatch();
                }
                bufferedBatch = flowBatch;
                hasBufferedBatch = true;
            } else {
                if (!isForeignDataReady()) {
                    requestForeignData();
                }
                if (isForeignDataReady()) {
                    ensureIndex();
                    this.handle = specializeAndPropagate;
                } else {
                    pendingInput = true;
                    this.handle = discardDatum;
                }
                beginBatch(flowBatch);
            }
        };

        const complete = this.complete.bind(this);
        this.complete = () => {
            // No later boundary exists to flush the final group.
            if (selfInput && (hasBufferedBatch || bufferedData.length > 0)) {
                flushBufferedBatch();
            }
            if (foreignCollector && !pendingInput && !isForeignDataReady()) {
                requestForeignData();
            }
            primaryCompleted = true;
            // Stamp before downstream completion notifies domain subscribers.
            // An empty primary can incorporate an available empty side input
            // without ever building an index or receiving a batch boundary.
            if (
                foreignCollector &&
                !pendingInput &&
                foreignCollector.completed &&
                isForeignDataReady() &&
                (evaluatedRevision === -1 ||
                    evaluatedRevision === foreignCollector.dataRevision)
            ) {
                this.#consumedForeignRevision = foreignCollector.dataRevision;
            }
            complete();
        };

        this.handle = selfInput ? bufferDatum : specializeAndPropagate;
    }
}

/**
 * Tests whether a lookup uses its current input batch as the lookup table.
 *
 * @param {import("../../spec/transform.js").LookupParams | import("../../spec/transform.js").CoordinateLookupParams} params
 */
export function isSelfLookup(params) {
    return (
        params.type == "lookup" &&
        "source" in params.from &&
        params.from.source == "input"
    );
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
