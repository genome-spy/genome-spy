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
    let needsEscaping = false;
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char === MULTI_KEY_ESCAPE || char === MULTI_KEY_SEPARATOR) {
            needsEscaping = true;
            break;
        }
    }

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
    return escapeKeyString(String(scalar));
}

/**
 * @param {string[]} keyFields
 * @param {import("../spec/channel.js").Scalar[]} keyTuple
 * @returns {string}
 */
function makeCompositeKeyFromTuple(keyFields, keyTuple) {
    let compositeKey = "";
    for (let i = 0; i < keyTuple.length; i++) {
        if (i > 0) {
            compositeKey += MULTI_KEY_SEPARATOR;
        }

        const scalar = validateKeyComponent(keyTuple[i], keyFields, i);
        compositeKey += encodeKeyPart(scalar);
    }

    return compositeKey;
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
            ? makeCompositeKeyFromTuple(canonicalFields, keyTuple)
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

        if (!usesCompositeKey) {
            const accessor = accessors[0];
            for (const data of facetBatches) {
                for (let i = 0, n = data.length; i < n; i++) {
                    const datum = data[i];
                    const key = validateKeyComponent(
                        accessor(datum),
                        keyFields,
                        0
                    );

                    const previous = index.get(key);
                    if (previous !== undefined) {
                        throw new Error(
                            `Duplicate key detected for fields [${keyFields.join(
                                ", "
                            )}]: ${JSON.stringify(key)}`
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

                        const scalar = validateKeyComponent(
                            accessors[j](datum),
                            keyFields,
                            j
                        );
                        compositeKey += encodeKeyPart(scalar);
                    }

                    const previous = index.get(compositeKey);
                    if (previous !== undefined) {
                        const duplicateTuple = accessors.map((accessor) =>
                            accessor(datum)
                        );
                        throw new Error(
                            `Duplicate key detected for fields [${keyFields.join(
                                ", "
                            )}]: ${JSON.stringify(duplicateTuple)}`
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
