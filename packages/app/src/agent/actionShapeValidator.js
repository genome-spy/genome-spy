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

/**
 * @param {unknown} program
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
