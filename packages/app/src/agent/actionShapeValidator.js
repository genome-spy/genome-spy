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

const intentProgramSchema = createSchemaWrapper(
    generatedActionSchema.definitions.AgentIntentProgram
);
const validateIntentProgramSchema = ajv.compile(intentProgramSchema);

const stepVariants =
    generatedActionSchema.definitions.AgentIntentProgramStep.anyOf;

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
export function validateIntentProgramShape(program) {
    if (program && typeof program === "object") {
        const candidate = /** @type {{ steps?: unknown[] }} */ (program);
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

    if (validateIntentProgramSchema(program)) {
        return {
            ok: true,
            errors: [],
        };
    }

    return {
        ok: false,
        errors: formatAjvErrors("$", validateIntentProgramSchema.errors),
    };
}

/**
 * @param {import("./types.js").AgentActionType} actionType
 * @param {unknown} payload
 * @returns {import("./types.js").ShapeValidationResult}
 */
export function validateActionPayloadShape(actionType, payload) {
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
        errors: formatAjvErrors("$", validator.errors),
    };
}
