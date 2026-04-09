// @ts-check
import Ajv from "ajv";
import generatedToolCatalog from "./generatedToolCatalog.json" with { type: "json" };
import generatedToolSchema from "./generatedToolSchema.json" with { type: "json" };

const AjvClass = /** @type {any} */ (Ajv);

const ajv = new AjvClass({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
});

/** @type {Map<string, import("ajv").ValidateFunction>} */
const validatorsByToolName = new Map();

/**
 * @returns {import("./types.d.ts").AgentToolCatalogEntry[]}
 */
export function listAgentTools() {
    return generatedToolCatalog.map((entry) => ({
        ...entry,
        inputFields: entry.inputFields.map((field) => ({
            ...field,
        })),
    }));
}

/**
 * @returns {Array<{
 *     type: "function";
 *     name: string;
 *     description: string;
 *     parameters: Record<string, any>;
 *     strict: true;
 * }>}
 */
export function buildResponsesToolDefinitions() {
    return generatedToolCatalog.map((entry) => ({
        type: "function",
        name: entry.toolName,
        description: entry.description,
        parameters: getToolParameters(entry.inputType),
        strict: true,
    }));
}

/**
 * Formats a tool-call rejection message using the generated tool catalog.
 *
 * @param {string} toolName
 * @param {string[]} errors
 * @returns {string}
 */
export function formatToolCallRejection(toolName, errors) {
    const tool = generatedToolCatalog.find(
        (entry) => entry.toolName === toolName
    );

    const validationText =
        errors.length > 0
            ? "Validation errors:\n- " + errors.join("\n- ")
            : "Validation failed.";

    if (!tool) {
        return (
            "Tool call was incorrect and rejected. Correct it before trying again. " +
            validationText
        );
    }

    const expectedFields = tool.inputFields
        .map((field) => `${field.name} (${field.type})`)
        .join(", ");
    const exampleInput = JSON.stringify(tool.exampleInput, null, 2);

    return [
        "Tool call was incorrect and rejected. Correct it before trying again.",
        `${tool.toolName} expects ${expectedFields}.`,
        "Example input:",
        exampleInput,
        validationText,
    ].join("\n");
}

/**
 * @param {string} toolName
 * @param {unknown} toolArguments
 * @returns {import("./types.d.ts").ShapeValidationResult}
 */
export function validateToolArgumentsShape(toolName, toolArguments) {
    const validator = getToolArgumentsValidator(toolName);
    if (!validator) {
        return {
            ok: false,
            errors: ["Unsupported planner tool " + toolName + "."],
        };
    }

    if (validator(toolArguments)) {
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

/**
 * @param {string} inputType
 * @returns {Record<string, any>}
 */
function getToolParameters(inputType) {
    const schemaDefinitions = /** @type {Record<string, any>} */ (
        generatedToolSchema.definitions ?? {}
    );
    const schema = schemaDefinitions[inputType];
    if (!schema) {
        throw new Error(
            "Missing generated schema for tool input " + inputType + "."
        );
    }

    return {
        ...schema,
        definitions: generatedToolSchema.definitions,
    };
}

/**
 * @param {string} toolName
 * @returns {import("ajv").ValidateFunction | undefined}
 */
function getToolArgumentsValidator(toolName) {
    const cachedValidator = validatorsByToolName.get(toolName);
    if (cachedValidator) {
        return cachedValidator;
    }

    const tool = generatedToolCatalog.find(
        (entry) => entry.toolName === toolName
    );
    if (!tool) {
        return undefined;
    }

    const schemaDefinitions = /** @type {Record<string, any>} */ (
        generatedToolSchema.definitions ?? {}
    );
    const schema = schemaDefinitions[tool.inputType];
    if (!schema) {
        throw new Error(
            "Missing generated schema for tool input " + tool.inputType + "."
        );
    }

    const validator = ajv.compile(getSchemaWrapper(schema));
    validatorsByToolName.set(toolName, validator);
    return validator;
}

/**
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>}
 */
function getSchemaWrapper(schema) {
    return {
        $schema: generatedToolSchema.$schema,
        definitions: generatedToolSchema.definitions,
        ...schema,
    };
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
