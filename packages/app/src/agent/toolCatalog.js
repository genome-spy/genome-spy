// @ts-check
import Ajv from "ajv";
import generatedToolCatalog from "./generated/generatedToolCatalog.json" with { type: "json" };
import generatedToolSchema from "./generated/generatedToolSchema.json" with { type: "json" };
import generatedActionCatalog from "./generated/generatedActionCatalog.json" with { type: "json" };
import { formatAjvErrors } from "./validationErrorFormatter.js";

// These generated artifacts are derived from agentToolInputs.d.ts and are the
// runtime source for tool descriptions, validation, and Responses API shapes.
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
 *     strict: boolean;
 * }>}
 */
export function buildResponsesToolDefinitions() {
    return generatedToolCatalog.map((entry) => ({
        type: "function",
        name: entry.toolName,
        description: formatToolDescription(entry),
        parameters: getToolParameters(entry.inputType),
        strict: entry.strict !== false,
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
    const action = generatedActionCatalog.find(
        (entry) => entry.actionType === toolName
    );

    const validationText =
        errors.length > 0
            ? "Validation errors:\n- " + errors.join("\n- ")
            : "Validation failed.";

    if (!tool) {
        if (action) {
            const exampleProgram = JSON.stringify(
                {
                    actions: [
                        {
                            actionType: toolName,
                            payload: action.examplePayload,
                        },
                    ],
                },
                null,
                2
            );

            return [
                "Tool call was incorrect and rejected. Correct it before trying again.",
                `${toolName} is an actionType, not a callable tool.`,
                "Use `submitIntentActions` and put that actionType inside `actions`.",
                "Example input:",
                exampleProgram,
                validationText,
            ].join("\n");
        }

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
            errors: ["Unsupported agent tool " + toolName + "."],
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

    return projectToolSchema(schema, schemaDefinitions);
}

/**
 * @param {import("./types.d.ts").AgentToolCatalogEntry} entry
 * @returns {string}
 */
function formatToolDescription(entry) {
    return entry.description;
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
 * @param {Record<string, any>} definitions
 * @param {Set<string>} [excludedDefinitionNames]
 * @param {Set<string>} [visited]
 * @returns {Record<string, any>}
 */
function projectToolSchema(
    schema,
    definitions,
    excludedDefinitionNames = new Set(["AgentIntentBatchStep"]),
    visited = new Set()
) {
    if (schema === null || typeof schema !== "object") {
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map((item) =>
            projectToolSchema(
                item,
                definitions,
                excludedDefinitionNames,
                visited
            )
        );
    }

    const ref = /** @type {{ $ref?: unknown }} */ (schema).$ref;
    if (typeof ref === "string") {
        const refName = ref.replace("#/definitions/", "");
        if (excludedDefinitionNames.has(refName) || visited.has(refName)) {
            return { type: "object" };
        }

        const refSchema = definitions[refName];
        if (!refSchema) {
            return { type: "object" };
        }

        visited.add(refName);
        const projected = projectToolSchema(
            refSchema,
            definitions,
            excludedDefinitionNames,
            visited
        );
        visited.delete(refName);
        return projected;
    }

    /** @type {Record<string, any>} */
    const projected = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === "definitions" || key === "$schema") {
            continue;
        }

        if (
            key === "properties" &&
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            projected.properties = Object.fromEntries(
                Object.entries(value).map(([propertyName, propertySchema]) => [
                    propertyName,
                    projectToolSchema(
                        propertySchema,
                        definitions,
                        excludedDefinitionNames,
                        visited
                    ),
                ])
            );
            continue;
        }

        if (
            key === "items" ||
            key === "not" ||
            key === "if" ||
            key === "then" ||
            key === "else"
        ) {
            projected[key] = projectToolSchema(
                value,
                definitions,
                excludedDefinitionNames,
                visited
            );
            continue;
        }

        if (
            (key === "anyOf" || key === "allOf" || key === "oneOf") &&
            Array.isArray(value)
        ) {
            projected[key] = value.map((item) =>
                projectToolSchema(
                    item,
                    definitions,
                    excludedDefinitionNames,
                    visited
                )
            );
            continue;
        }

        if (
            key === "additionalProperties" &&
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            projected[key] = projectToolSchema(
                value,
                definitions,
                excludedDefinitionNames,
                visited
            );
            continue;
        }

        projected[key] = value;
    }

    if (projected.type === "object" && projected.properties === undefined) {
        projected.properties = {};
    }

    return projected;
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
