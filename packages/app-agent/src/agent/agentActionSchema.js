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
    // Default agent-visible action attributes intentionally omit
    // featureFilter. Filtered interval aggregations materialize a new metadata
    // column and should not be advertised for transient plotting or grouping.
    AttributeIdentifier: {
        anyOf: [
            { $ref: "#/definitions/SampleAttributeIdentifier" },
            { $ref: "#/definitions/SelectionAggregationCandidate" },
        ],
    },
    // deriveMetadata is the one public action where filtered raw features are
    // useful: the filter becomes part of the materialized metadata definition.
    DeriveMetadataAttributeIdentifier: {
        anyOf: [
            { $ref: "#/definitions/SampleAttributeIdentifier" },
            {
                $ref: "#/definitions/DeriveMetadataSelectionAggregationCandidate",
            },
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
        DeriveMetadataSelectionAggregationCandidate:
            createDeriveMetadataSelectionAggregationCandidateSchema(),
    };
}

/**
 * @returns {Record<string, any>}
 */
function createDeriveMetadataSelectionAggregationCandidateSchema() {
    const base = generatedToolSchema.definitions.SelectionAggregationCandidate;
    return {
        ...base,
        properties: {
            ...base.properties,
            // Keep the base generated SelectionAggregationCandidate unfiltered
            // so strict tool schemas for plots do not make featureFilter
            // required. This derive-only schema adds it back for action docs
            // and submitIntentAction validation.
            featureFilter: {
                $ref: "#/definitions/FeatureFilter",
                description:
                    "Optional raw-feature predicate applied inside the selected interval before per-sample aggregation. Use one field copied from the candidate's `filterableFields`; call `getSelectionFeatureFieldSummary` first if exact categorical values or numeric bounds are needed.",
            },
        },
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
 * Returns the agent-facing payload schema for one action type.
 *
 * @param {import("./types.js").AgentActionType} actionType
 * @returns {Record<string, any> | undefined}
 */
export function getAgentActionPayloadSchema(actionType) {
    const schema = getActionPayloadSchema(actionType);
    if (actionType !== "sampleView/deriveMetadata" || !schema) {
        return schema;
    }

    const deriveMetadataSchema =
        generatedActionSchema.definitions.DeriveMetadata;
    return {
        ...deriveMetadataSchema,
        properties: {
            ...deriveMetadataSchema.properties,
            // The canonical app payload type uses AttributeIdentifier here.
            // Project only this field to the derive-only agent-facing type so
            // other action attributes keep the narrower unfiltered contract.
            attribute: {
                ...deriveMetadataSchema.properties.attribute,
                $ref: "#/definitions/DeriveMetadataAttributeIdentifier",
            },
        },
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
