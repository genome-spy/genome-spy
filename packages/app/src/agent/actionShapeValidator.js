// @ts-check
import Ajv from "ajv";
import generatedActionSchema from "./generatedActionSchema.json" with { type: "json" };

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
 * @param {string} instancePath
 * @returns {string}
 */
function formatPath(instancePath) {
    if (!instancePath) {
        return "$";
    }

    const parts = instancePath.split("/").slice(1);
    let path = "$";
    for (const part of parts) {
        const segment = part.replaceAll("~1", "/").replaceAll("~0", "~");
        if (/^\d+$/.test(segment)) {
            path += "[" + segment + "]";
        } else {
            path += "." + segment;
        }
    }

    return path;
}

/**
 * @param {string} prefix
 * @param {import("ajv").ErrorObject[] | null | undefined} errors
 * @returns {string[]}
 */
function formatAjvErrors(prefix, errors) {
    if (!errors) {
        return [];
    }

    /** @type {string[]} */
    const messages = [];

    for (const error of errors) {
        const path = formatPath(error.instancePath);
        const fullPath = path === "$" ? prefix : prefix + path.slice(1);

        if (error.keyword === "required") {
            messages.push(
                fullPath + "." + error.params.missingProperty + " is required."
            );
        } else if (error.keyword === "additionalProperties") {
            messages.push(
                fullPath +
                    " has unexpected property " +
                    error.params.additionalProperty +
                    "."
            );
        } else if (error.keyword === "type") {
            messages.push(
                fullPath + " must be of type " + error.params.type + "."
            );
        } else if (error.keyword === "enum") {
            messages.push(
                fullPath +
                    " must be one of " +
                    error.params.allowedValues
                        .map((/** @type {unknown} */ value) =>
                            JSON.stringify(value)
                        )
                        .join(", ") +
                    "."
            );
        } else if (error.keyword === "const") {
            messages.push(
                fullPath +
                    " must equal " +
                    JSON.stringify(error.params.allowedValue) +
                    "."
            );
        } else if (error.keyword === "minimum") {
            messages.push(
                fullPath +
                    " must be greater than or equal to " +
                    error.params.limit +
                    "."
            );
        } else if (error.keyword === "exclusiveMinimum") {
            messages.push(
                fullPath + " must be greater than " + error.params.limit + "."
            );
        } else if (error.keyword === "minItems") {
            messages.push(
                fullPath +
                    " must contain at least " +
                    error.params.limit +
                    " item(s)."
            );
        } else if (error.keyword === "maxItems") {
            messages.push(
                fullPath +
                    " must contain at most " +
                    error.params.limit +
                    " item(s)."
            );
        } else if (error.keyword === "anyOf" || error.keyword === "oneOf") {
            messages.push(fullPath + " must match a schema variant.");
        } else {
            messages.push(fullPath + " " + error.message + ".");
        }
    }

    return messages;
}

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
