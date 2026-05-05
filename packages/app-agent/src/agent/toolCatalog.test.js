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
        expect(toolNames).toContain("jumpToInitialProvenanceState");
        expect(toolNames).toContain("resolveMetadataAttributeValues");
        expect(toolNames).toContain("showSampleAttributePlot");
        expect(toolNames).toContain("submitIntentActions");
    });

    it("builds Responses API function tool definitions", () => {
        const toolDefinitions = buildResponsesToolDefinitions();
        const jumpToInitialProvenanceState = toolDefinitions.find(
            (tool) => tool.name === "jumpToInitialProvenanceState"
        );
        const submitIntentActions = toolDefinitions.find(
            (tool) => tool.name === "submitIntentActions"
        );
        const getIntentActionDocs = toolDefinitions.find(
            (tool) => tool.name === "getIntentActionDocs"
        );
        const showSampleAttributePlot = toolDefinitions.find(
            (tool) => tool.name === "showSampleAttributePlot"
        );
        const zoomToScale = toolDefinitions.find(
            (tool) => tool.name === "zoomToScale"
        );

        expect(jumpToInitialProvenanceState).toMatchObject({
            name: "jumpToInitialProvenanceState",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        });
        expect(submitIntentActions).toMatchObject({
            name: "submitIntentActions",
            strict: false,
        });
        expect(getIntentActionDocs).toMatchObject({
            name: "getIntentActionDocs",
            strict: true,
            parameters: {
                required: ["actionType", "includeSchema"],
            },
        });
        expect(showSampleAttributePlot).toMatchObject({
            name: "showSampleAttributePlot",
            strict: true,
            parameters: {
                type: "object",
                required: ["plot"],
                properties: {
                    plot: {
                        anyOf: expect.any(Array),
                    },
                },
            },
        });
        expect(showSampleAttributePlot.parameters).not.toHaveProperty("anyOf");
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
        expect(JSON.stringify(showSampleAttributePlot.parameters)).toContain(
            "value by group"
        );
        expect(JSON.stringify(toolDefinitions)).not.toContain(
            "AgentIntentBatchStep"
        );
    });

    it("validates tool arguments against the generated schema", () => {
        const validation = validateToolArgumentsShape("setViewVisibility", {
            selector: '{"scope":[],"view":"reference-sequence"}',
            visibility: "True",
        });

        expect(validation.ok).toBe(false);
        expect(validation.errors).toEqual([
            "$.selector must be of type object.",
            "$.visibility must be of type boolean.",
        ]);
    });

    it("validates sample attribute plot shapes by intent kind", () => {
        expect(
            validateToolArgumentsShape("showSampleAttributePlot", {
                plot: {
                    kind: "valueDistributionByCurrentGroups",
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "age",
                    },
                },
            }).ok
        ).toBe(true);

        expect(
            validateToolArgumentsShape("showSampleAttributePlot", {
                plot: {
                    kind: "valueDistributionByCurrentGroups",
                    attribute: {
                        type: "VALUE_AT_LOCUS",
                        specifier: {
                            view: {
                                scope: [],
                                view: "track",
                            },
                            field: "beta",
                            interval: {
                                type: "selection",
                                selector: {
                                    scope: [],
                                    param: "brush",
                                },
                            },
                            aggregation: {
                                op: "max",
                            },
                        },
                        label: "TP53 region beta",
                    },
                },
            }).ok
        ).toBe(true);

        expect(
            validateToolArgumentsShape("showSampleAttributePlot", {
                plot: {
                    kind: "valueDistributionByCurrentGroups",
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
                },
            }).ok
        ).toBe(false);

        expect(
            validateToolArgumentsShape("showSampleAttributePlot", {
                plot: {
                    kind: "quantitativeRelationship",
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "age",
                    },
                },
            }).ok
        ).toBe(false);

        expect(
            validateToolArgumentsShape("showSampleAttributePlot", {
                plot: {
                    kind: "quantitativeRelationship",
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
                },
            }).ok
        ).toBe(true);
    });

    it("normalizes nested tool object schemas for OpenAI strict mode", () => {
        const showSampleAttributePlot = buildResponsesToolDefinitions().find(
            (tool) => tool.name === "showSampleAttributePlot"
        );

        expect(
            findObjectSchemasWithMissingRequiredProperties(
                showSampleAttributePlot.parameters
            )
        ).toEqual([]);
        expect(
            JSON.stringify(showSampleAttributePlot.parameters)
        ).not.toContain("domainAtActionTime");
    });

    it("explains when an actionType is mistakenly called as a tool", () => {
        const message = formatToolCallRejection("paramProvenance/paramChange", [
            "Unsupported agent tool paramProvenance/paramChange.",
        ]);

        expect(message).toContain(
            "paramProvenance/paramChange is an actionType, not a callable tool."
        );
        expect(message).toContain("Use `submitIntentActions`");
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
