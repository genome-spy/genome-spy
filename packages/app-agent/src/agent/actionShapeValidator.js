// @ts-check
import Ajv from "ajv";
import generatedActionSchema from "./generated/generatedActionSchema.json" with { type: "json" };
import { formatAjvErrors } from "./validationErrorFormatter.js";

const AjvClass = /** @type {any} */ (Ajv);

const ajv = new AjvClass({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
});

/**
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>}
 */
function createSchemaWrapper(schema) {
    return {
        $schema: generatedActionSchema.$schema,
        definitions: generatedActionSchema.definitions,
        ...schema,
    };
}

const intentBatchContainerSchema = createSchemaWrapper({
    ...generatedActionSchema.definitions.AgentIntentBatch,
    properties: {
        ...generatedActionSchema.definitions.AgentIntentBatch.properties,
        steps: {
            type: "array",
            minItems: 1,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["actionType", "payload"],
                properties: {
                    actionType: {
                        type: "string",
                    },
                    payload: {
                        type: "object",
                    },
                },
            },
        },
    },
});
const validateIntentBatchContainerSchema = ajv.compile(
    intentBatchContainerSchema
);

const stepVariants =
    generatedActionSchema.definitions.AgentIntentBatchStep.anyOf;

/** @type {Set<string>} */
const supportedActionTypes = new Set(
    stepVariants.map((entry) => entry.properties.actionType.const)
);

/** @type {Map<string, import("ajv").ValidateFunction>} */
const payloadValidatorsByActionType = new Map(
    stepVariants.map((entry) => {
        const actionType = entry.properties.actionType.const;
        const payloadSchema = entry.properties.payload;
        return [actionType, ajv.compile(createSchemaWrapper(payloadSchema))];
    })
);

const paramSelectorValidator = ajv.compile(
    createSchemaWrapper(generatedActionSchema.definitions.ParamSelector)
);
const paramOriginValidator = ajv.compile(
    createSchemaWrapper(generatedActionSchema.definitions.ParamOrigin)
);
const paramValuePointValidator = ajv.compile(
    createSchemaWrapper(generatedActionSchema.definitions.ParamValuePoint)
);
const paramValuePointExpandValidator = ajv.compile(
    createSchemaWrapper(generatedActionSchema.definitions.ParamValuePointExpand)
);

/**
 * @param {unknown} batch
 * @returns {import("./types.js").ShapeValidationResult}
 */
export function validateIntentBatchShape(batch) {
    if (batch && typeof batch === "object") {
        const candidate = /** @type {{ steps?: unknown[] }} */ (batch);
        if (Array.isArray(candidate.steps) && candidate.steps.length) {
            for (const [index, step] of candidate.steps.entries()) {
                const action = /** @type {{ actionType?: unknown }} */ (step);
                if (
                    action &&
                    typeof action.actionType === "string" &&
                    !supportedActionTypes.has(action.actionType)
                ) {
                    return {
                        ok: false,
                        errors: [
                            `$.steps[${index}].actionType uses unsupported actionType ${action.actionType}.`,
                        ],
                    };
                }
            }
        }
    }

    if (!validateIntentBatchContainerSchema(batch)) {
        return {
            ok: false,
            errors: formatAjvErrors(
                "$",
                validateIntentBatchContainerSchema.errors
            ),
        };
    }

    if (batch && typeof batch === "object") {
        const candidate = /** @type {{ steps?: unknown[] }} */ (batch);
        if (Array.isArray(candidate.steps)) {
            /** @type {string[]} */
            const errors = [];
            for (const [index, step] of candidate.steps.entries()) {
                const action =
                    /** @type {{ actionType?: unknown; payload?: unknown }} */ (
                        step
                    );
                if (typeof action.actionType !== "string") {
                    continue;
                }

                const payloadValidation = validateActionPayloadShape(
                    /** @type {import("./types.js").AgentActionType} */ (
                        action.actionType
                    ),
                    action.payload,
                    `$.steps[${index}].payload`
                );
                if (!payloadValidation.ok) {
                    errors.push(...payloadValidation.errors);
                }
            }

            if (errors.length) {
                return {
                    ok: false,
                    errors,
                };
            }
        }
    }

    return {
        ok: true,
        errors: [],
    };
}

/**
 * @param {import("./types.js").AgentActionType} actionType
 * @param {unknown} payload
 * @param {string} [prefix]
 * @returns {import("./types.js").ShapeValidationResult}
 */
export function validateActionPayloadShape(actionType, payload, prefix = "$") {
    if (actionType === "paramProvenance/paramChange") {
        return validateParamProvenanceEntryShape(payload, prefix);
    }

    const validator = payloadValidatorsByActionType.get(actionType);
    if (!validator) {
        return {
            ok: false,
            errors: ["Unsupported actionType " + actionType + "."],
        };
    }

    if (validator(payload)) {
        return {
            ok: true,
            errors: [],
        };
    }

    return {
        ok: false,
        errors: formatAjvErrors(prefix, validator.errors),
    };
}

/**
 * Validates param provenance entries without surfacing the raw union noise
 * from the generated schema.
 *
 * @param {unknown} payload
 * @param {string} prefix
 * @returns {import("./types.js").ShapeValidationResult}
 */
function validateParamProvenanceEntryShape(payload, prefix) {
    if (!isObject(payload)) {
        return {
            ok: false,
            errors: [prefix + " must be of type object."],
        };
    }

    const candidate = /** @type {Record<string, any>} */ (payload);
    /** @type {string[]} */
    const errors = unexpectedProperties(candidate, prefix, [
        "selector",
        "value",
        "origin",
    ]);

    if (!("selector" in candidate)) {
        errors.push(prefix + ".selector is required.");
    } else {
        errors.push(
            ...validateObjectWithSchema(
                paramSelectorValidator,
                candidate.selector,
                prefix + ".selector"
            )
        );
    }

    if (!("value" in candidate)) {
        errors.push(prefix + ".value is required.");
    } else {
        errors.push(
            ...validateParamValueShape(candidate.value, prefix + ".value")
        );
    }

    if ("origin" in candidate) {
        errors.push(
            ...validateObjectWithSchema(
                paramOriginValidator,
                candidate.origin,
                prefix + ".origin"
            )
        );
    }

    return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/**
 * @param {unknown} value
 * @param {string} prefix
 * @returns {string[]}
 */
function validateParamValueShape(value, prefix) {
    if (!isObject(value)) {
        return [prefix + " must be of type object."];
    }

    const candidate = /** @type {Record<string, any>} */ (value);
    /** @type {string[]} */
    const errors = unexpectedProperties(candidate, prefix, [
        "type",
        "value",
        "intervals",
        "keyFields",
        "keys",
        "operation",
        "partitionBy",
        "origin",
        "rule",
        "predicate",
    ]);

    if (typeof candidate.type !== "string") {
        errors.push(prefix + ".type must be of type string.");
        return errors;
    }

    if (candidate.type === "value") {
        if (!("value" in candidate)) {
            errors.push(prefix + ".value is required.");
        }
        return errors;
    }

    if (candidate.type === "interval") {
        errors.push(...validateParamValueIntervalShape(candidate, prefix));
        return errors;
    }

    if (candidate.type === "point") {
        return validateObjectWithSchema(
            paramValuePointValidator,
            candidate,
            prefix
        );
    }

    if (candidate.type === "pointExpand") {
        return validateObjectWithSchema(
            paramValuePointExpandValidator,
            candidate,
            prefix
        );
    }

    errors.push(
        prefix +
            '.type must be one of "value", "interval", "point", "pointExpand".'
    );
    return errors;
}

/**
 * @param {Record<string, any>} value
 * @param {string} prefix
 * @returns {string[]}
 */
function validateParamValueIntervalShape(value, prefix) {
    if (!("intervals" in value)) {
        return [prefix + ".intervals is required."];
    }

    if (!isObject(value.intervals)) {
        return [prefix + ".intervals must be of type object."];
    }

    const intervals = /** @type {Record<string, any>} */ (value.intervals);
    /** @type {string[]} */
    const errors = unexpectedProperties(intervals, prefix + ".intervals", [
        "x",
        "y",
    ]);

    if ("x" in intervals) {
        errors.push(
            ...validateIntervalShape(intervals.x, prefix + ".intervals.x")
        );
    }

    if ("y" in intervals) {
        errors.push(
            ...validateIntervalShape(intervals.y, prefix + ".intervals.y")
        );
    }

    return errors;
}

/**
 * @param {unknown} interval
 * @param {string} prefix
 * @returns {string[]}
 */
function validateIntervalShape(interval, prefix) {
    if (interval === null) {
        return [];
    }

    if (!Array.isArray(interval)) {
        return [prefix + " must be of type array or null."];
    }

    /** @type {string[]} */
    const errors = [];

    if (interval.length !== 2) {
        errors.push(prefix + " must contain exactly 2 item(s).");
    }

    for (const [index, item] of interval.entries()) {
        const itemPrefix = prefix + "[" + index + "]";
        if (typeof item === "number") {
            continue;
        }

        if (!isObject(item)) {
            errors.push(itemPrefix + " must be of type number or object.");
            continue;
        }

        errors.push(...validateChromosomalLocusShape(item, itemPrefix));
    }

    return errors;
}

/**
 * @param {Record<string, any>} locus
 * @param {string} prefix
 * @returns {string[]}
 */
function validateChromosomalLocusShape(locus, prefix) {
    /** @type {string[]} */
    const errors = unexpectedProperties(locus, prefix, ["chrom", "pos"]);

    if (!("chrom" in locus)) {
        errors.push(prefix + ".chrom is required.");
    } else if (typeof locus.chrom !== "string") {
        errors.push(prefix + ".chrom must be of type string.");
    }

    if ("pos" in locus && typeof locus.pos !== "number") {
        errors.push(prefix + ".pos must be of type number.");
    }

    return errors;
}

/**
 * @param {import("ajv").ValidateFunction} validator
 * @param {unknown} value
 * @param {string} prefix
 * @returns {string[]}
 */
function validateObjectWithSchema(validator, value, prefix) {
    if (validator(value)) {
        return [];
    }

    return formatAjvErrors(prefix, validator.errors);
}

/**
 * @param {Record<string, any>} candidate
 * @param {string} prefix
 * @param {string[]} allowedKeys
 * @returns {string[]}
 */
function unexpectedProperties(candidate, prefix, allowedKeys) {
    const allowed = new Set(allowedKeys);
    /** @type {string[]} */
    const errors = [];

    for (const key of Object.keys(candidate)) {
        if (!allowed.has(key)) {
            errors.push(prefix + " has unexpected property " + key + ".");
        }
    }

    return errors;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
