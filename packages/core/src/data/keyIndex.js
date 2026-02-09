import { field } from "../utils/field.js";

const MULTI_KEY_SEPARATOR = "|";
const MULTI_KEY_ESCAPE = "\\";

/**
 * Lazily builds and caches lookup indexes for `encoding.key` fields so that
 * bookmarked point selections can be resolved back to datums efficiently.
 */
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

        const fieldList = keyFields.join(", ");
        if (keyFields.length !== keyTuple.length) {
            throw new Error(
                `Key tuple length ${keyTuple.length} does not match fields [${fieldList}]`
            );
        }

        if (!this.#index || !this.#matchesKeyFields(keyFields)) {
            this.#buildIndex(keyFields, facetBatches);
        }

        const canonicalFields = /** @type {string[]} */ (this.#keyFields);
        /** @type {import("../spec/channel.js").Scalar | string} */
        let key;
        if (!this.#usesCompositeKey) {
            const fieldName = canonicalFields[0];
            key = validateKeyComponent(keyTuple[0], fieldName);
        } else {
            let compositeKey = "";
            for (let i = 0; i < keyTuple.length; i++) {
                if (i > 0) {
                    compositeKey += MULTI_KEY_SEPARATOR;
                }

                const fieldName = canonicalFields[i];
                const value = validateKeyComponent(keyTuple[i], fieldName);

                compositeKey += encodeKeyPart(value);
            }
            key = compositeKey;
        }

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
        const fieldList = keyFields.join(", ");

        const usesCompositeKey = keyFields.length !== 1;

        if (!usesCompositeKey) {
            const accessor = accessors[0];
            const fieldName = keyFields[0];
            for (const data of facetBatches) {
                for (let i = 0, n = data.length; i < n; i++) {
                    const datum = data[i];
                    const key = validateKeyComponent(
                        accessor(datum),
                        fieldName
                    );

                    const previous = index.get(key);
                    if (previous !== undefined) {
                        throw new Error(
                            `Duplicate key detected for fields [${fieldList}]: ${JSON.stringify(key)}`
                        );
                    }

                    index.set(key, datum);
                }
            }
        } else {
            for (const data of facetBatches) {
                for (let i = 0, n = data.length; i < n; i++) {
                    const datum = data[i];
                    let compositeKey = "";
                    for (let j = 0; j < accessors.length; j++) {
                        if (j > 0) {
                            compositeKey += MULTI_KEY_SEPARATOR;
                        }

                        const fieldName = keyFields[j];
                        const value = validateKeyComponent(
                            accessors[j](datum),
                            fieldName
                        );

                        compositeKey += encodeKeyPart(value);
                    }

                    const previous = index.get(compositeKey);
                    if (previous !== undefined) {
                        const duplicateTuple = accessors.map((accessor) =>
                            accessor(datum)
                        );
                        throw new Error(
                            `Duplicate key detected for fields [${fieldList}]: ${JSON.stringify(duplicateTuple)}`
                        );
                    }

                    index.set(compositeKey, datum);
                }
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

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {import("../spec/channel.js").Scalar}
 */
function validateKeyComponent(value, fieldName) {
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
    const needsEscaping =
        value.indexOf(MULTI_KEY_ESCAPE) !== -1 ||
        value.indexOf(MULTI_KEY_SEPARATOR) !== -1;

    if (!needsEscaping) {
        return value;
    }

    let escaped = "";
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char === MULTI_KEY_ESCAPE || char === MULTI_KEY_SEPARATOR) {
            escaped += MULTI_KEY_ESCAPE;
        }
        escaped += char;
    }

    return escaped;
}

/**
 * @param {import("../spec/channel.js").Scalar} scalar
 * @returns {string}
 */
function encodeKeyPart(scalar) {
    if (typeof scalar === "string") {
        return escapeKeyString(scalar);
    }

    return String(scalar);
}
