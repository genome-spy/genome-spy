// @ts-check
import generatedActionSchema from "./generated/generatedActionSchema.json" with { type: "json" };
import generatedToolSchema from "./generated/generatedToolSchema.json" with { type: "json" };

/*
 * Shared helpers for action payload schemas.
 *
 * `generatedActionSchema` describes canonical reducer-facing intent actions.
 * The agent, however, submits a narrower action dialect: attributes may be
 * sample metadata identifiers or compact selection-aggregation candidates, not
 * internal VALUE_AT_LOCUS structures. Keep that projection here so validators
 * and `getIntentActionDocs(..., includeSchema: true)` expose the same contract.
 */

const definitionRefPrefix = "#/definitions/";
const omittedDocsDefinitions = new Map([
    [
        "Scale",
        {
            description:
                "Scale definitions are accepted but omitted from action docs because the full visualization scale schema is large. Omit this field unless the user explicitly asks to preserve or override a scale; use null to force automatic scale inference.",
            type: "object",
        },
    ],
]);

export const stepVariants =
    generatedActionSchema.definitions.AgentIntentBatchStep.anyOf;

/**
 * Returns action schema definitions with the agent-facing AttributeIdentifier
 * overlay. The compact attribute variant definitions come from the generated
 * tool schema so their descriptions stay sourced from `agentToolInputs.d.ts`.
 *
 * @returns {Record<string, any>}
 */
export function getAgentActionSchemaDefinitions() {
    return {
        ...generatedActionSchema.definitions,
        AttributeIdentifier: {
            anyOf: [
                { $ref: "#/definitions/SampleAttributeIdentifier" },
                { $ref: "#/definitions/SelectionAggregationCandidate" },
            ],
        },
        SampleAttributeIdentifier:
            generatedToolSchema.definitions.SampleAttributeIdentifier,
        SelectionAggregationCandidate:
            generatedToolSchema.definitions.SelectionAggregationCandidate,
    };
}

/**
 * Wraps a schema fragment for canonical action validation.
 *
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>}
 */
export function createActionSchemaWrapper(schema) {
    return {
        $schema: generatedActionSchema.$schema,
        definitions: generatedActionSchema.definitions,
        ...schema,
    };
}

/**
 * Wraps a schema fragment for agent-facing action validation.
 *
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>}
 */
export function createAgentActionSchemaWrapper(schema) {
    return {
        $schema: generatedActionSchema.$schema,
        definitions: getAgentActionSchemaDefinitions(),
        ...schema,
    };
}

/**
 * Returns the canonical payload schema reference for one action type.
 *
 * @param {import("./types.js").AgentActionType} actionType
 * @returns {Record<string, any> | undefined}
 */
export function getActionPayloadSchema(actionType) {
    const variant = stepVariants.find(
        (entry) => entry.properties.actionType.const === actionType
    );
    return variant?.properties.payload;
}

/**
 * Builds the compact schema bundle returned by action docs. The root schema
 * may keep `$ref`s, but referenced definitions needed by that payload are
 * included. Some broad app/core spec definitions are represented by compact
 * placeholders so action docs do not become a full visualization grammar dump.
 *
 * @param {import("./types.js").AgentActionType} actionType
 * @returns {Record<string, any> | undefined}
 */
export function getAgentActionPayloadSchemaBundle(actionType) {
    const payloadSchema = getActionPayloadSchema(actionType);
    if (!payloadSchema) {
        return undefined;
    }

    const definitions = getAgentActionSchemaDefinitions();

    return {
        $schema: generatedActionSchema.$schema,
        ...cloneJson(payloadSchema),
        definitions: collectReachableDefinitions(payloadSchema, definitions),
    };
}

/**
 * @param {unknown} schema
 * @param {Record<string, any>} definitions
 * @returns {Record<string, any>}
 */
function collectReachableDefinitions(schema, definitions) {
    /** @type {Set<string>} */
    const visited = new Set();
    /** @type {Record<string, any>} */
    const reachable = {};

    visitSchema(schema, definitions, visited, reachable);

    return reachable;
}

/**
 * @param {unknown} schema
 * @param {Record<string, any>} definitions
 * @param {Set<string>} visited
 * @param {Record<string, any>} reachable
 */
function visitSchema(schema, definitions, visited, reachable) {
    if (schema === null || typeof schema !== "object") {
        return;
    }

    if (Array.isArray(schema)) {
        for (const item of schema) {
            visitSchema(item, definitions, visited, reachable);
        }
        return;
    }

    const objectSchema = /** @type {Record<string, any>} */ (schema);
    const ref = objectSchema.$ref;
    if (typeof ref === "string" && ref.startsWith(definitionRefPrefix)) {
        const definitionName = ref.slice(definitionRefPrefix.length);
        const omittedDefinition = omittedDocsDefinitions.get(definitionName);
        if (omittedDefinition) {
            reachable[definitionName] = cloneJson(omittedDefinition);
            visited.add(definitionName);
            return;
        }

        if (!visited.has(definitionName) && definitions[definitionName]) {
            visited.add(definitionName);
            reachable[definitionName] = cloneJson(definitions[definitionName]);
            visitSchema(
                definitions[definitionName],
                definitions,
                visited,
                reachable
            );
        }
    }

    for (const value of Object.values(objectSchema)) {
        visitSchema(value, definitions, visited, reachable);
    }
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
