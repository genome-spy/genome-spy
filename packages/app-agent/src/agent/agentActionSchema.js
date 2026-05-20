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
 * and action/type docs expose the same contract.
 */

/** @type {Record<string, any>} */
export const agentSchemaOverrides = {
    // The app's canonical AttributeIdentifier includes internal selector forms
    // that are never useful to the LLM. Action docs expose only metadata
    // attributes and compact selection-aggregation candidates. The latter may
    // include featureFilter here so the agent can learn the shape once, while
    // actionShapeValidator keeps filtered candidates executable only through
    // deriveMetadata to match the current UI workflow.
    AttributeIdentifier: {
        anyOf: [
            { $ref: "#/definitions/SampleAttributeIdentifier" },
            { $ref: "#/definitions/SelectionAggregationCandidate" },
        ],
    },
};

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
        ...agentSchemaOverrides,
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
