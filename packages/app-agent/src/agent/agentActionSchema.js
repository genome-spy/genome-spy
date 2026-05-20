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

const definitionRefPrefix = "#/definitions/";

/** @type {Record<string, any>} */
export const primitiveTypeSchemas = {
    boolean: { type: "boolean" },
    number: { type: "number" },
    string: { type: "string" },
};

/** @type {Record<string, any>} */
export const agentSchemaOverrides = {
    AttributeIdentifier: {
        anyOf: [
            { $ref: "#/definitions/SampleAttributeIdentifier" },
            { $ref: "#/definitions/SelectionAggregationCandidate" },
        ],
    },
};

/** @type {Record<string, { schema: Record<string, any> }>} */
export const docsOnlyTypeSummaries = {
    Scale: {
        schema: {
            description:
                "Scale construction guide for metadata visualization. This curated subset documents common scale properties; it is not the full validation schema.",
            properties: {
                domain: {
                    description: "Explicit input values or numeric extent.",
                },
                domainMax: { type: "number" },
                domainMid: { type: "number" },
                domainMin: { type: "number" },
                range: {
                    description: "Output colors, values, or named range.",
                },
                reverse: { type: "boolean" },
                scheme: {
                    description: "Color scheme name or scheme parameters.",
                },
                type: { $ref: "#/definitions/ScaleType" },
                zero: { type: "boolean" },
            },
            type: "object",
        },
    },
    SampleAttributeDef: {
        schema: {
            description:
                "Sample attribute definition. Use this when importing metadata and preserving column metadata such as title, type, or scale.",
            type: "object",
        },
    },
};

/** @type {Record<string, string>} */
export const typeAliasResolvers = {
    'SampleAttributeDef["scale"]': "Scale",
};

/** @type {Record<string, unknown[]>} */
export const typeExamples = {
    Scale: [
        {
            type: "linear",
            scheme: "viridis",
        },
        {
            domain: [0.2, 0.8],
            range: ["#4575b4", "#ffffbf", "#d73027"],
            type: "threshold",
        },
    ],
};

/** @type {Record<string, string[]>} */
export const typeNotes = {
    AttributeIdentifier: [
        "Use SAMPLE_ATTRIBUTE for metadata attributes from context.",
        "Use SELECTION_AGGREGATION by copying candidateId from selectionAggregation.fields, choosing one of that field's supportedAggregations, and using filterableFields for optional featureFilter values.",
    ],
    NominalFilterValue: [
        "Use exact category values from context, getAttributeSummary, or resolveMetadataAttributeValues results.",
    ],
    "Record<AttributeName, SampleAttributeDef>": [
        "Keys are metadata attribute names from the imported columnar metadata.",
    ],
    "Scale | null": [
        "Omit this field unless the user asks to preserve or override scale metadata.",
        "Use null to force automatic scale inference.",
        "The returned Scale schema is a construction guide, not the full validation schema.",
    ],
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

const unionSeparator = /\s*\|\s*/;

/**
 * Resolves the small TypeScript-ish display type subset emitted by the action
 * catalog. This is not a general TypeScript parser.
 *
 * @param {string} typeText
 * @param {Record<string, any>} definitions
 * @returns {{
 *     normalizedTypeName?: string;
 *     schema: Record<string, any>;
 *     notes?: string[];
 * }}
 */
export function resolveDisplayTypeExpression(typeText, definitions) {
    if (primitiveTypeSchemas[typeText]) {
        return {
            notes: [
                "Primitive type. Use the field description from action docs for semantics.",
            ],
            schema: cloneJson(primitiveTypeSchemas[typeText]),
        };
    }

    if (typeText.endsWith("[]")) {
        const itemType = typeText.slice(0, -2);
        const item = resolveDisplayTypeExpression(itemType, definitions);
        return {
            notes: item.notes,
            schema: {
                items: item.schema,
                type: "array",
            },
        };
    }

    const nonEmptyArrayMatch = typeText.match(/^\[(\w+), \.\.\.\1\[\]\]$/);
    if (nonEmptyArrayMatch) {
        return {
            schema: {
                items: refSchema(nonEmptyArrayMatch[1]),
                minItems: 1,
                type: "array",
            },
        };
    }

    const recordMatch = typeText.match(/^Record<[^,]+,\s*([^>]+)>$/);
    if (recordMatch) {
        return {
            notes: typeNotes[typeText] ?? [],
            schema: {
                additionalProperties: refSchema(recordMatch[1].trim()),
                type: "object",
            },
        };
    }

    if (typeText.includes("|")) {
        return resolveUnionTypeExpression(typeText, definitions);
    }

    if (typeAliasResolvers[typeText]) {
        const normalizedTypeName = typeAliasResolvers[typeText];
        return {
            normalizedTypeName,
            notes: typeNotes[normalizedTypeName] ?? [],
            schema: refSchema(normalizedTypeName),
        };
    }

    if (docsOnlyTypeSummaries[typeText]) {
        return {
            notes: typeNotes[typeText] ?? [],
            schema: cloneJson(docsOnlyTypeSummaries[typeText].schema),
        };
    }

    if (definitions[typeText]) {
        return {
            notes: typeNotes[typeText] ?? [],
            schema: cloneJson(definitions[typeText]),
        };
    }

    throw new Error("Unsupported intent action payload type " + typeText + ".");
}

/**
 * @param {string} typeText
 * @param {Record<string, any>} definitions
 * @returns {{
 *     normalizedTypeName?: string;
 *     schema: Record<string, any>;
 *     notes?: string[];
 * }}
 */
function resolveUnionTypeExpression(typeText, definitions) {
    const variants = typeText.split(unionSeparator);
    const resolved = variants.map((variant) => {
        if (variant === "null") {
            return { schema: { type: "null" } };
        } else if (typeAliasResolvers[variant]) {
            const normalizedTypeName = typeAliasResolvers[variant];
            return {
                normalizedTypeName,
                schema: refSchema(normalizedTypeName),
            };
        } else if (definitions[variant] || docsOnlyTypeSummaries[variant]) {
            return {
                normalizedTypeName: variant,
                schema: refSchema(variant),
            };
        } else {
            return resolveDisplayTypeExpression(variant, definitions);
        }
    });
    const normalizedTypeName = resolved
        .map((entry, index) => entry.normalizedTypeName ?? variants[index])
        .join(" | ");

    return {
        normalizedTypeName,
        notes: [
            ...(typeNotes[normalizedTypeName] ?? []),
            ...resolved.flatMap((entry) => entry.notes ?? []),
        ],
        schema: {
            anyOf: resolved.map((entry) => entry.schema),
        },
    };
}

/**
 * @param {string} typeName
 * @returns {Record<string, any>}
 */
function refSchema(typeName) {
    if (primitiveTypeSchemas[typeName]) {
        return cloneJson(primitiveTypeSchemas[typeName]);
    }
    return { $ref: definitionRefPrefix + typeName };
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
