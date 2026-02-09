import { field } from "../utils/field.js";

const MULTI_KEY_SEPARATOR = "|";
const MULTI_KEY_ESCAPE = "\\";

/**
 * @param {unknown} value
 * @param {string[]} keyFields
 * @param {number} index
 * @returns {import("../spec/channel.js").Scalar}
 */
function validateKeyComponent(value, keyFields, index) {
    const fieldName = keyFields[index];
    if (value === undefined) {
        throw new Error(
            `Key field "${fieldName}" is undefined. Ensure all key fields are present in the data.`
        );
    }

    if (value === null) {
        throw new Error(
            `Key field "${fieldName}" is null. Ensure all key fields are present in the data.`
        );
    }

    if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
    ) {
        throw new Error(
            `Key field "${fieldName}" must be a scalar value (string, number, or boolean).`
        );
    }

    return value;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeKeyString(value) {
    return value
        .replaceAll(MULTI_KEY_ESCAPE, MULTI_KEY_ESCAPE + MULTI_KEY_ESCAPE)
        .replaceAll(
            MULTI_KEY_SEPARATOR,
            MULTI_KEY_ESCAPE + MULTI_KEY_SEPARATOR
        );
}

/**
 * @param {string[]} keyFields
 * @param {unknown[]} keyTuple
 * @returns {string}
 */
function makeCompositeKey(keyFields, keyTuple) {
    return keyTuple
        .map((value, i) => {
            const scalar = validateKeyComponent(value, keyFields, i);
            if (typeof scalar === "string") {
                return "s:" + escapeKeyString(scalar);
            } else if (typeof scalar === "number") {
                return "n:" + String(scalar);
            } else {
                return scalar ? "b:1" : "b:0";
            }
        })
        .join(MULTI_KEY_SEPARATOR);
}

export default class KeyIndex {
    /**
     * @typedef {import("./flowNode.js").Datum} Datum
     * @typedef {import("./flowNode.js").Data} Data
     */

    /** @type {Map<import("../spec/channel.js").Scalar | string, Datum> | null} */
    #index = null;

    /** @type {string[] | null} */
    #keyFields = null;

    /** @type {boolean} */
    #usesCompositeKey = false;

    invalidate() {
        this.#index = null;
        this.#keyFields = null;
        this.#usesCompositeKey = false;
    }

    /**
     * @param {string[]} keyFields
     * @param {import("../spec/channel.js").Scalar[]} keyTuple
     * @param {Iterable<Data>} facetBatches
     * @returns {Datum | undefined}
     */
    findDatum(keyFields, keyTuple, facetBatches) {
        if (!keyFields || keyFields.length === 0) {
            return;
        }

        if (keyFields.length !== keyTuple.length) {
            throw new Error(
                `Key tuple length ${keyTuple.length} does not match fields [${keyFields.join(
                    ", "
                )}]`
            );
        }

        if (!this.#index || !this.#matchesKeyFields(keyFields)) {
            this.#buildIndex(keyFields, facetBatches);
        }

        const canonicalFields = /** @type {string[]} */ (this.#keyFields);
        const key = this.#usesCompositeKey
            ? makeCompositeKey(canonicalFields, keyTuple)
            : validateKeyComponent(keyTuple[0], canonicalFields, 0);

        return this.#index.get(key);
    }

    /**
     * @param {string[]} keyFields
     * @param {Iterable<Data>} facetBatches
     */
    #buildIndex(keyFields, facetBatches) {
        /** @type {Array<(datum: Datum) => import("../spec/channel.js").Scalar>} */
        const accessors = keyFields.map((fieldName) => field(fieldName));
        /** @type {Map<import("../spec/channel.js").Scalar | string, Datum>} */
        const index = new Map();

        const usesCompositeKey = keyFields.length !== 1;

        for (const data of facetBatches) {
            for (let i = 0, n = data.length; i < n; i++) {
                const datum = data[i];
                const keyTuple = accessors.map((accessor) => accessor(datum));
                const key = usesCompositeKey
                    ? makeCompositeKey(keyFields, keyTuple)
                    : validateKeyComponent(keyTuple[0], keyFields, 0);

                if (index.has(key)) {
                    const duplicateValue = usesCompositeKey ? keyTuple : key;
                    throw new Error(
                        `Duplicate key detected for fields [${keyFields.join(
                            ", "
                        )}]: ${JSON.stringify(duplicateValue)}`
                    );
                }

                index.set(key, datum);
            }
        }

        this.#index = index;
        this.#keyFields = [...keyFields];
        this.#usesCompositeKey = usesCompositeKey;
    }

    /**
     * @param {string[]} keyFields
     * @returns {boolean}
     */
    #matchesKeyFields(keyFields) {
        if (!this.#keyFields) {
            return false;
        }

        if (this.#keyFields.length !== keyFields.length) {
            return false;
        }

        for (let i = 0; i < keyFields.length; i++) {
            if (this.#keyFields[i] !== keyFields[i]) {
                return false;
            }
        }

        return true;
    }
}
