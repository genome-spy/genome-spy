import { getAllProperties } from "../../utils/cloner.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/** @typedef {import("../flowNode.js").Datum} Datum */

/**
 * Forms a Cartesian product with a finite foreign relation and combines both
 * field sets into new flat rows.
 */
export default class CrossTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /** @type {import("../collector.js").default} */
    #foreignCollector;

    /** @type {Datum[] | undefined} */
    #foreignData;

    /** @type {string[] | undefined} */
    #foreignFields;

    /** @type {((primary: Datum, foreign: Datum) => Datum) | undefined} */
    #combine;

    #primaryCompleted = false;

    /**
     * @param {import("../../spec/transform.js").CrossParams} params
     * @param {import("../collector.js").default} foreignCollector
     */
    constructor(params, foreignCollector) {
        super(params);
        this.#foreignCollector = foreignCollector;

        this.registerDisposer(
            foreignCollector.observe(() => {
                this.#foreignData = undefined;
                this.#foreignFields = undefined;
                this.#combine = undefined;

                if (this.#primaryCompleted && this.parent) {
                    this.repropagate();
                }
            })
        );
    }

    reset() {
        super.reset();
        this.#combine = undefined;
        this.#primaryCompleted = false;
    }

    /**
     * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        this.#combine = undefined;
        super.beginBatch(flowBatch);
    }

    /**
     * @param {Datum} datum
     */
    handle(datum) {
        this.#prepareForeignData();
        if (this.#foreignData.length === 0) {
            return;
        }

        this.#combine ??= createCombiner(
            getAllProperties(datum),
            this.#foreignFields
        );

        for (const foreignDatum of this.#foreignData) {
            this._propagate(this.#combine(datum, foreignDatum));
        }
    }

    complete() {
        this.#primaryCompleted = true;
        super.complete();
    }

    #prepareForeignData() {
        if (this.#foreignData) {
            return;
        }
        if (!this.#foreignCollector.completed) {
            throw new Error(
                "Cross foreign data must be loaded before primary data."
            );
        }

        this.#foreignData = Array.from(this.#foreignCollector.getData());
        this.#foreignFields =
            this.#foreignData.length === 0
                ? []
                : getAllProperties(this.#foreignData[0]);

        const expectedFields = new Set(this.#foreignFields);
        for (let i = 1; i < this.#foreignData.length; i++) {
            const fields = getAllProperties(this.#foreignData[i]);
            if (
                fields.length !== expectedFields.size ||
                fields.some((field) => !expectedFields.has(field))
            ) {
                throw new Error(
                    "Cross foreign data must have homogeneous fields."
                );
            }
        }
    }
}

/**
 * Creates a specialized flat-row combiner for one homogeneous primary batch
 * and foreign relation.
 *
 * @param {string[]} primaryFields
 * @param {string[]} foreignFields
 */
function createCombiner(primaryFields, foreignFields) {
    const primaryFieldSet = new Set(primaryFields);
    const duplicates = foreignFields.filter((field) =>
        primaryFieldSet.has(field)
    );
    if (duplicates.length > 0) {
        throw new Error(
            `Cross fields must be unique. Duplicate fields: ${JSON.stringify(duplicates)}.`
        );
    }

    const assignments = [
        ...primaryFields.map((field) => createAssignment("primary", field)),
        ...foreignFields.map((field) => createAssignment("foreign", field)),
    ];

    return /** @type {(primary: Datum, foreign: Datum) => Datum} */ (
        Function("primary", "foreign", `return { ${assignments.join(",\n")} };`)
    );
}

/**
 * @param {"primary" | "foreign"} source
 * @param {string} field
 */
function createAssignment(source, field) {
    const quotedField = JSON.stringify(field);
    return `${quotedField}: ${source}[${quotedField}]`;
}
