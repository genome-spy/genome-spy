import generatedToolCatalog from "./generatedToolCatalog.json" with { type: "json" };
import generatedToolSchema from "./generatedToolSchema.json" with { type: "json" };

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
