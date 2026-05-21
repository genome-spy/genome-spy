import { describe, expect, it } from "vitest";
import {
    buildResponsesToolDefinitions,
    formatToolCallRejection,
    listAgentTools,
    validateToolArgumentsShape,
} from "./toolCatalog.js";

describe("toolCatalog", () => {
    it("exposes the generated agent tools", () => {
        const tools = listAgentTools();
        const toolNames = tools.map((entry) => entry.toolName);

        expect(new Set(toolNames).size).toBe(toolNames.length);
        expect(toolNames).toContain("jumpToProvenanceState");
        expect(toolNames).not.toContain("jumpToInitialProvenanceState");
        expect(toolNames).toContain("resolveMetadataAttributeValues");
        expect(toolNames).toContain("showCategoryCountsPlot");
        expect(toolNames).toContain("showAttributeDistributionPlot");
        expect(toolNames).toContain("showAttributeRelationshipPlot");
        expect(toolNames).toContain("submitIntentAction");
        expect(toolNames).not.toContain("submitIntentActions");
        expect(toolNames).not.toContain("buildSelectionAggregationAttribute");
    });

    it("builds Responses API function tool definitions", () => {
        const toolDefinitions = buildResponsesToolDefinitions();
        const jumpToProvenanceState = toolDefinitions.find(
            (tool) => tool.name === "jumpToProvenanceState"
        );
        const submitIntentAction = toolDefinitions.find(
            (tool) => tool.name === "submitIntentAction"
        );
        const getIntentActionDocs = toolDefinitions.find(
            (tool) => tool.name === "getIntentActionDocs"
        );
        const getIntentActionTypeDocs = toolDefinitions.find(
            (tool) => tool.name === "getIntentActionTypeDocs"
        );
        const showAttributeRelationshipPlot = toolDefinitions.find(
            (tool) => tool.name === "showAttributeRelationshipPlot"
        );
        const zoomToScale = toolDefinitions.find(
            (tool) => tool.name === "zoomToScale"
        );

        expect(jumpToProvenanceState).toMatchObject({
            name: "jumpToProvenanceState",
            parameters: {
                type: "object",
                required: ["provenanceId"],
                properties: {
                    provenanceId: {
                        type: ["string", "null"],
                    },
                },
                additionalProperties: false,
            },
        });
        expect(submitIntentAction).toMatchObject({
            name: "submitIntentAction",
            strict: false,
        });
        expect(getIntentActionDocs).toMatchObject({
            name: "getIntentActionDocs",
            strict: true,
            parameters: {
                required: ["actionType"],
            },
        });
        expect(getIntentActionTypeDocs).toMatchObject({
            name: "getIntentActionTypeDocs",
            strict: true,
            parameters: {
                required: ["referenceDepth", "typeName"],
            },
        });
        expect(showAttributeRelationshipPlot).toMatchObject({
            name: "showAttributeRelationshipPlot",
            strict: true,
            parameters: {
                type: "object",
                required: ["attributes", "kind"],
                properties: {
                    attributes: {
                        type: "array",
                        minItems: 2,
                        maxItems: 2,
                    },
                },
            },
        });
        expect(zoomToScale).toMatchObject({
            name: "zoomToScale",
            strict: true,
            parameters: {
                type: "object",
                properties: {
                    domain: {
                        anyOf: [
                            {
                                type: "array",
                                items: {
                                    type: "number",
                                },
                            },
                            {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        chrom: {
                                            type: "string",
                                        },
                                        pos: {
                                            type: "number",
                                        },
                                    },
                                    required: ["chrom", "pos"],
                                    additionalProperties: false,
                                },
                            },
                        ],
                    },
                },
            },
        });
        expect(
            JSON.stringify(showAttributeRelationshipPlot.parameters)
        ).toContain("Do not treat either attribute as a grouping variable.");
        expect(JSON.stringify(toolDefinitions)).not.toContain(
            "AgentIntentBatchStep"
        );
    });

    it("validates tool arguments against the generated schema", () => {
        const validation = validateToolArgumentsShape("setViewVisibility", {
            selector: "reference-sequence",
            visibility: "True",
        });

        expect(validation.ok).toBe(false);
        expect(validation.errors).toEqual([
            "$.selector must be of type object.",
            "$.visibility must be of type boolean.",
        ]);
    });

    it("validates focused sample attribute plot shapes", () => {
        expect(
            validateToolArgumentsShape("showAttributeDistributionPlot", {
                kind: "boxplot",
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "age",
                },
            }).ok
        ).toBe(true);

        expect(
            validateToolArgumentsShape("showAttributeDistributionPlot", {
                kind: "boxplot",
                attribute: {
                    type: "SELECTION_AGGREGATION",
                    candidateId: "brush@track:beta",
                    aggregation: "max",
                },
            }).ok
        ).toBe(true);

        expect(
            validateToolArgumentsShape("showAttributeDistributionPlot", {
                kind: "boxplot",
                attributes: [
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "age",
                    },
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "purity",
                    },
                ],
            }).ok
        ).toBe(false);

        expect(
            validateToolArgumentsShape("showAttributeRelationshipPlot", {
                kind: "scatterplot",
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "age",
                },
            }).ok
        ).toBe(false);

        expect(
            validateToolArgumentsShape("showAttributeRelationshipPlot", {
                kind: "scatterplot",
                attributes: [
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "age",
                    },
                    {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "purity",
                    },
                ],
            }).ok
        ).toBe(true);
    });

    it("parses escaped JSON strings when an object is expected by a tool schema", () => {
        const toolArguments = {
            kind: "boxplot",
            attribute: '{"type":"SAMPLE_ATTRIBUTE","specifier":"mutations"}',
        };

        const validation = validateToolArgumentsShape(
            "showAttributeDistributionPlot",
            toolArguments
        );

        expect(validation.ok).toBe(true);
        expect(toolArguments.attribute).toEqual({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "mutations",
        });
    });

    it("accepts selection aggregation candidates in submitIntentAction payload attributes", () => {
        const validation = validateToolArgumentsShape("submitIntentAction", {
            action: {
                actionType: "sampleView/sortBy",
                payload: {
                    attribute: {
                        type: "SELECTION_AGGREGATION",
                        candidateId: "brush@track:beta",
                        aggregation: "max",
                    },
                },
            },
        });

        expect(validation.ok).toBe(true);
    });

    it("rejects array-shaped submitIntentAction payloads", () => {
        const validation = validateToolArgumentsShape("submitIntentAction", {
            actions: [
                {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
            ],
        });

        expect(validation.ok).toBe(false);
        expect(validation.errors).toContain("$.action is required.");
        expect(validation.errors).toContain(
            "$ has unexpected property actions."
        );
    });

    it("suggests action type docs after malformed submitIntentAction arguments", () => {
        const message = formatToolCallRejection("submitIntentAction", [
            "$.action.payload.attribute.type must be equal to one of the allowed values.",
        ]);

        expect(message).toContain("getIntentActionTypeDocs");
        expect(message).toContain("payload field type");
        expect(message).not.toContain("includeSchema");
    });

    it("keeps string values as strings when a tool schema expects a string", () => {
        const toolArguments = {
            query: '{"type":"SAMPLE_ATTRIBUTE","specifier":"mutations"}',
        };

        const validation = validateToolArgumentsShape(
            "resolveMetadataAttributeValues",
            toolArguments
        );

        expect(validation.ok).toBe(true);
        expect(toolArguments.query).toBe(
            '{"type":"SAMPLE_ATTRIBUTE","specifier":"mutations"}'
        );
    });

    it("normalizes nested tool object schemas for OpenAI strict mode", () => {
        const showAttributeRelationshipPlot =
            buildResponsesToolDefinitions().find(
                (tool) => tool.name === "showAttributeRelationshipPlot"
            );

        expect(
            findObjectSchemasWithMissingRequiredProperties(
                showAttributeRelationshipPlot.parameters
            )
        ).toEqual([]);
        expect(
            JSON.stringify(showAttributeRelationshipPlot.parameters)
        ).not.toContain("domainAtActionTime");
    });

    it("does not expose feature filters in direct attribute tool schemas", () => {
        const directAttributeToolNames = new Set([
            "getAttributeSummary",
            "showCategoryCountsPlot",
            "showAttributeDistributionPlot",
            "showAttributeRelationshipPlot",
        ]);
        const directAttributeToolDefinitions =
            buildResponsesToolDefinitions().filter((tool) =>
                directAttributeToolNames.has(tool.name)
            );

        expect(JSON.stringify(directAttributeToolDefinitions)).not.toContain(
            "featureFilter"
        );
    });

    it("explains when an actionType is mistakenly called as a tool", () => {
        const message = formatToolCallRejection("paramProvenance/paramChange", [
            "Unsupported agent tool paramProvenance/paramChange.",
        ]);

        expect(message).toContain(
            "paramProvenance/paramChange is an actionType, not a callable tool."
        );
        expect(message).toContain("Use `submitIntentAction`");
        expect(message).toContain(
            '"actionType": "paramProvenance/paramChange"'
        );
        expect(message).toContain("Validation errors:");
    });
});

/**
 * @param {unknown} schema
 * @param {string} [path]
 * @returns {string[]}
 */
function findObjectSchemasWithMissingRequiredProperties(schema, path = "$") {
    if (!schema || typeof schema !== "object") {
        return [];
    }

    if (Array.isArray(schema)) {
        return schema.flatMap((item, index) =>
            findObjectSchemasWithMissingRequiredProperties(
                item,
                path + "[" + index + "]"
            )
        );
    }

    const objectSchema = /** @type {Record<string, any>} */ (schema);
    const errors = [];
    if (
        objectSchema.type === "object" &&
        objectSchema.properties &&
        typeof objectSchema.properties === "object" &&
        !Array.isArray(objectSchema.properties)
    ) {
        const required = Array.isArray(objectSchema.required)
            ? objectSchema.required
            : [];
        const missing = Object.keys(objectSchema.properties).filter(
            (key) => !required.includes(key)
        );
        if (missing.length) {
            errors.push(path + " missing required keys: " + missing.join(","));
        }
    }

    for (const [key, value] of Object.entries(objectSchema)) {
        errors.push(
            ...findObjectSchemasWithMissingRequiredProperties(
                value,
                path + "." + key
            )
        );
    }

    return errors;
}
