// @ts-check
import Ajv from "ajv";
import generatedActionSchema from "./generated/generatedActionSchema.json" with { type: "json" };
import { formatAjvErrors } from "./validationErrorFormatter.js";
import { repairJsonEncodedObjects } from "./schemaJsonRepair.js";

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

/**
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>}
 */
function createAgentSchemaWrapper(schema) {
    return {
        $schema: generatedActionSchema.$schema,
        definitions: {
            ...generatedActionSchema.definitions,
            AttributeIdentifier: {
                anyOf: [
                    { $ref: "#/definitions/SampleAttributeIdentifier" },
                    { $ref: "#/definitions/SelectionAggregationCandidate" },
                ],
            },
            SampleAttributeIdentifier: sampleAttributeIdentifierSchema,
            SelectionAggregationCandidate: selectionAggregationCandidateSchema,
        },
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

/** @type {Record<string, any>} */
const selectionAggregationCandidateSchema = {
    additionalProperties: false,
    properties: {
        aggregation: {
            $ref: "#/definitions/AggregationOp",
            description:
                "Aggregation op applied within the current interval selection for each sample.",
        },
        candidateId: {
            description:
                "Exact candidate id copied from selectionAggregation.fields. Do not construct this from parameter, view, or field names.",
            type: "string",
        },
        recordFilter: {
            $ref: "#/definitions/RecordFilter",
            description:
                "Optional raw-record predicate applied inside the selected interval before per-sample aggregation.",
        },
        type: {
            const: "SELECTION_AGGREGATION",
            type: "string",
        },
    },
    required: ["type", "candidateId", "aggregation"],
    type: "object",
};

/** @type {Record<string, any>} */
const sampleAttributeIdentifierSchema = {
    additionalProperties: false,
    properties: {
        specifier: {
            type: "string",
        },
        type: {
            const: "SAMPLE_ATTRIBUTE",
            type: "string",
        },
    },
    required: ["type", "specifier"],
    type: "object",
};

/** @type {Map<string, import("ajv").ValidateFunction>} */
const agentPayloadValidatorsByActionType = new Map(
    stepVariants.map((entry) => {
        const actionType = entry.properties.actionType.const;
        return [
            actionType,
            ajv.compile(createAgentSchemaWrapper(entry.properties.payload)),
        ];
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
    return validateActionPayloadShapeWithSchemas(
        actionType,
        payload,
        prefix,
        payloadValidatorsByActionType,
        /** @type {Record<string, any>} */ (
            generatedActionSchema.definitions ?? {}
        )
    );
}

/**
 * Validates the agent-facing action payload shape. This accepts canonical
 * AttributeIdentifiers and compact SELECTION_AGGREGATION candidates, which are
 * normalized before the reducer-facing intent batch is submitted.
 *
 * @param {import("./types.js").AgentActionType} actionType
 * @param {unknown} payload
 * @param {string} [prefix]
 * @returns {import("./types.js").ShapeValidationResult}
 */
export function validateAgentActionPayloadShape(
    actionType,
    payload,
    prefix = "$"
) {
    const internalAttributePaths = findInternalValueAtLocusAttributes(
        payload,
        prefix
    );
    if (internalAttributePaths.length > 0) {
        return {
            ok: false,
            errors: internalAttributePaths.map(
                (path) =>
                    path +
                    " uses internal VALUE_AT_LOCUS syntax. Use a SAMPLE_ATTRIBUTE from context or a SELECTION_AGGREGATION candidate copied from selectionAggregation.fields."
            ),
        };
    }

    const malformedSelectionAggregationErrors =
        findMalformedSelectionAggregationCandidates(payload, prefix);
    if (malformedSelectionAggregationErrors.length > 0) {
        return {
            ok: false,
            errors: malformedSelectionAggregationErrors,
        };
    }

    return validateActionPayloadShapeWithSchemas(
        actionType,
        payload,
        prefix,
        agentPayloadValidatorsByActionType,
        {
            ...generatedActionSchema.definitions,
            AttributeIdentifier: {
                anyOf: [
                    { $ref: "#/definitions/SampleAttributeIdentifier" },
                    { $ref: "#/definitions/SelectionAggregationCandidate" },
                ],
            },
            SampleAttributeIdentifier: sampleAttributeIdentifierSchema,
            SelectionAggregationCandidate: selectionAggregationCandidateSchema,
        }
    );
}

/**
 * @param {import("./types.js").AgentActionType} actionType
 * @param {unknown} payload
 * @param {string} prefix
 * @param {Map<string, import("ajv").ValidateFunction>} validatorsByActionType
 * @param {Record<string, any>} definitions
 * @returns {import("./types.js").ShapeValidationResult}
 */
function validateActionPayloadShapeWithSchemas(
    actionType,
    payload,
    prefix,
    validatorsByActionType,
    definitions
) {
    if (actionType === "paramProvenance/paramChange") {
        return validateParamProvenanceEntryShape(payload, prefix);
    }

    const payloadSchema = getActionPayloadSchema(actionType);
    if (payloadSchema) {
        repairJsonEncodedObjects(payload, payloadSchema, definitions);
    }

    const validator = validatorsByActionType.get(actionType);
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
 * @param {unknown} value
 * @param {string} path
 * @returns {string[]}
 */
function findMalformedSelectionAggregationCandidates(value, path) {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) =>
            findMalformedSelectionAggregationCandidates(
                item,
                path + "[" + index + "]"
            )
        );
    }

    if (!isObject(value)) {
        return [];
    }

    const errors =
        value.type === "SELECTION_AGGREGATION"
            ? validateSelectionAggregationCandidate(value, path)
            : [];

    return errors.concat(
        Object.entries(value).flatMap(([key, child]) =>
            findMalformedSelectionAggregationCandidates(child, path + "." + key)
        )
    );
}

/**
 * @param {Record<string, any>} value
 * @param {string} path
 * @returns {string[]}
 */
function validateSelectionAggregationCandidate(value, path) {
    /** @type {string[]} */
    const errors = [];

    if (typeof value.candidateId !== "string") {
        errors.push(
            path +
                ".candidateId must be copied exactly from selectionAggregation.fields."
        );
    }

    if (typeof value.aggregation !== "string") {
        errors.push(
            path +
                ".aggregation is required for SELECTION_AGGREGATION. Copy a supported aggregation from selectionAggregation.fields; use weightedMean for an interval mean when supported."
        );
    }

    return errors;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {string[]}
 */
function findInternalValueAtLocusAttributes(value, path) {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) =>
            findInternalValueAtLocusAttributes(item, path + "[" + index + "]")
        );
    }

    if (!isObject(value)) {
        return [];
    }

    const errors =
        value.type === "VALUE_AT_LOCUS" ? [path] : /** @type {string[]} */ ([]);

    return errors.concat(
        Object.entries(value).flatMap(([key, child]) =>
            findInternalValueAtLocusAttributes(child, path + "." + key)
        )
    );
}

/**
 * @param {import("./types.js").AgentActionType} actionType
 * @returns {Record<string, any> | undefined}
 */
function getActionPayloadSchema(actionType) {
    const variant = stepVariants.find(
        (entry) => entry.properties.actionType.const === actionType
    );
    return variant?.properties.payload;
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
