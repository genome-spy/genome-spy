import { asArray } from "../../utils/arrayUtils.js";
import { createCachedCloner } from "../../utils/cloner.js";
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

    /** @type {((datum: import("../flowNode.js").Datum) => any)[]} */
    #valueAccessors;

    /** @type {string[]} */
    #as;

    /** @type {string[]} */
    #foreignKeyFields;

    #implicitValues;

    #defaultValue;

    /** @type {(datum: import("../flowNode.js").Datum) => import("../flowNode.js").Datum | undefined} */
    #findForeignDatum;

    /** @type {ReturnType<typeof createCachedCloner>} */
    #clone = createCachedCloner();

    /** @type {(output: import("../flowNode.js").Datum, foreignDatum: import("../flowNode.js").Datum, accessors: ((datum: import("../flowNode.js").Datum) => any)[]) => void} */
    #writeMatchedValues;

    /** @type {(output: import("../flowNode.js").Datum, defaultValue: any) => void} */
    #writeDefaultValues;

    /** @type {Map<any, any> | null} */
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

        const foreignKeyFields = asArray(params.key);
        const primaryFields = asArray(params.fields ?? foreignKeyFields);
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

        this.#foreignKeyAccessors = foreignKeyFields.map((name) => field(name));
        this.#fieldAccessors = primaryFields.map((name) => field(name));
        this.#foreignKeyFields = foreignKeyFields;
        this.#implicitValues = !values;
        this.#valueAccessors = values?.map((name) => field(name)) ?? [];
        this.#as = as ?? values ?? [];
        this.#defaultValue = params.default ?? null;

        // Select the common single-key path once instead of branching per row.
        this.#findForeignDatum =
            foreignKeyFields.length === 1
                ? (datum) =>
                      /** @type {Map<any, import("../flowNode.js").Datum>} */ (
                          this.#index
                      ).get(this.#fieldAccessors[0](datum))
                : (datum) => {
                      /** @type {Map<any, Map<any, any>>} */
                      let level = this.#index;
                      for (
                          let i = 0;
                          i < this.#fieldAccessors.length - 1;
                          i++
                      ) {
                          const next = level.get(
                              this.#fieldAccessors[i](datum)
                          );
                          if (!next) {
                              return;
                          }
                          level = next;
                      }
                      return level.get(this.#fieldAccessors.at(-1)(datum));
                  };

        this.registerDisposer(
            foreignCollector.observe(() => {
                // Keep the index for primary-only reloads, but rebuild it when
                // the lookup table itself has changed.
                this.#invalidateIndex();
                this.#reloadPrimaryData();
            })
        );

        this.handle = this.#ensureAndSpecialize;
    }

    reset() {
        super.reset();
        this.#primaryCompleted = false;
        this.#clone.reset();
        // The cached table index remains valid until the foreign collector updates.
        this.handle = this.#ensureAndSpecialize;
    }

    /**
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        this.#clone.reset();
        this.#ensureIndex();
        this.handle = this.#specializeAndPropagate;
        super.beginBatch(flowBatch);
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    #ensureAndSpecialize(datum) {
        this.#ensureIndex();
        this.#specializeAndPropagate(datum);
    }

    /**
     * Validates the first datum and installs a fixed output writer. Dataflow
     * batches have a stable input shape, as required by the cached cloner.
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    #specializeAndPropagate(datum) {
        for (const name of this.#as) {
            if (Object.hasOwn(datum, name)) {
                throw new Error(
                    `Lookup output field "${name}" already exists in primary data.`
                );
            }
        }
        // Subsequent rows use the indexed handler directly.
        this.handle = this.#propagateLookup;
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

        // Discovering implicit values requires two passes over the table.
        const foreignData = this.#implicitValues
            ? Array.from(this.#foreignCollector.getData())
            : this.#foreignCollector.getData();
        if (this.#implicitValues) {
            const fieldNames = new Set();
            for (const foreignDatum of foreignData) {
                for (const name of Object.keys(foreignDatum)) {
                    fieldNames.add(name);
                }
            }
            const nestedKeyFields = this.#foreignKeyFields.filter(
                (name) => !fieldNames.has(name)
            );
            if (fieldNames.size && nestedKeyFields.length) {
                throw new Error(
                    'Omitting "values" requires top-level lookup key fields.'
                );
            }
            this.#as = Array.from(fieldNames).filter(
                (name) => !this.#foreignKeyFields.includes(name)
            );
            this.#valueAccessors = this.#as.map((name) => field(name));
        }

        /** @type {Map<any, any>} */
        const index = new Map();
        if (this.#foreignKeyAccessors.length === 1) {
            // A single key maps directly to its table row.
            const accessor = this.#foreignKeyAccessors[0];
            for (const foreignDatum of foreignData) {
                const key = accessor(foreignDatum);
                if (index.has(key)) {
                    throw new Error(
                        `Duplicate lookup key ${JSON.stringify([key])} in fields ${JSON.stringify(this.params.key)}.`
                    );
                }
                index.set(key, foreignDatum);
            }
        } else {
            // Nested maps preserve each composite-key component's type.
            for (const foreignDatum of foreignData) {
                /** @type {Map<any, any>} */
                let level = index;
                for (let i = 0; i < this.#foreignKeyAccessors.length - 1; i++) {
                    const key = this.#foreignKeyAccessors[i](foreignDatum);
                    let next = level.get(key);
                    if (!next) {
                        next = new Map();
                        level.set(key, next);
                    }
                    level = next;
                }

                const key = this.#foreignKeyAccessors.at(-1)(foreignDatum);
                if (level.has(key)) {
                    const duplicateKey = this.#foreignKeyAccessors.map(
                        (accessor) => accessor(foreignDatum)
                    );
                    throw new Error(
                        `Duplicate lookup key ${JSON.stringify(duplicateKey)} in fields ${JSON.stringify(this.params.key)}.`
                    );
                }
                level.set(key, foreignDatum);
            }
        }
        this.#index = index;
        this.#compileOutputWriters();
    }

    #compileOutputWriters() {
        const properties = this.#as.map((name) => JSON.stringify(name));
        this.#writeMatchedValues =
            /** @type {(output: import("../flowNode.js").Datum, foreignDatum: import("../flowNode.js").Datum, accessors: ((datum: import("../flowNode.js").Datum) => any)[]) => void} */ (
                new Function(
                    "output",
                    "foreignDatum",
                    "accessors",
                    properties
                        .map(
                            (name, i) =>
                                `output[${name}] = accessors[${i}](foreignDatum);`
                        )
                        .join("\n")
                )
            );
        this.#writeDefaultValues =
            /** @type {(output: import("../flowNode.js").Datum, defaultValue: any) => void} */ (
                new Function(
                    "output",
                    "defaultValue",
                    properties
                        .map((name) => `output[${name}] = defaultValue;`)
                        .join("\n")
                )
            );
    }

    #invalidateIndex() {
        this.#index = null;
        if (this.#implicitValues) {
            // The refreshed table may expose a different set of output fields.
            this.#valueAccessors = [];
            this.#as = [];
        }
        this.handle = this.#ensureAndSpecialize;
    }

    /**
     * @param {import("../flowNode.js").Datum} primaryDatum
     */
    #propagateLookup(primaryDatum) {
        const output = this.#clone(primaryDatum);
        const foreignDatum = this.#findForeignDatum(primaryDatum);
        if (foreignDatum) {
            this.#writeMatchedValues(
                output,
                foreignDatum,
                this.#valueAccessors
            );
        } else {
            this.#writeDefaultValues(output, this.#defaultValue);
        }
        this._propagate(output);
    }
}
