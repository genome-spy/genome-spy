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

        expect(toolNames).toEqual([
            "expandViewNode",
            "collapseViewNode",
            "setViewVisibility",
            "jumpToProvenanceState",
            "jumpToInitialProvenanceState",
            "buildSelectionAggregationAttribute",
            "getMetadataAttributeSummary",
            "getGroupedMetadataAttributeSummary",
            "searchViewDatums",
            "submitIntentActions",
        ]);
        expect(tools[3].strict).toBe(true);
        expect(tools[4].strict).toBe(true);
        expect(tools[5].strict).toBe(true);
        expect(tools[6].strict).toBe(true);
        expect(tools[7].strict).toBe(true);
        expect(tools[8].strict).toBe(true);
        expect(tools[9].strict).toBe(false);
    });

    it("builds Responses API function tool definitions", () => {
        const toolDefinitions = buildResponsesToolDefinitions();

        expect(toolDefinitions).toHaveLength(10);
        expect(toolDefinitions[0]).toEqual(
            expect.objectContaining({
                type: "function",
                name: "expandViewNode",
                strict: true,
            })
        );
        expect(JSON.stringify(toolDefinitions)).not.toContain(
            "AgentIntentBatchStep"
        );
        expect(toolDefinitions[2]).toEqual(
            expect.objectContaining({
                name: "setViewVisibility",
            })
        );
        expect(toolDefinitions[2].description).toContain(
            "visibility of a view"
        );
        expect(toolDefinitions[2].parameters.type).toBe("object");
        expect(toolDefinitions[3].name).toBe("jumpToProvenanceState");
        expect(toolDefinitions[3].parameters.type).toBe("object");
        expect(toolDefinitions[3].strict).toBe(true);
        expect(toolDefinitions[4].name).toBe("jumpToInitialProvenanceState");
        expect(toolDefinitions[4].parameters.type).toBe("object");
        expect(toolDefinitions[4].parameters.properties).toEqual({});
        expect(toolDefinitions[4].strict).toBe(true);
        expect(toolDefinitions[5].name).toBe(
            "buildSelectionAggregationAttribute"
        );
        expect(toolDefinitions[5].parameters.type).toBe("object");
        expect(toolDefinitions[5].strict).toBe(true);
        expect(toolDefinitions[6].name).toBe("getMetadataAttributeSummary");
        expect(toolDefinitions[6].parameters.type).toBe("object");
        expect(toolDefinitions[6].parameters.required).toEqual(["attribute"]);
        expect(toolDefinitions[6].strict).toBe(true);
        expect(toolDefinitions[7].name).toBe(
            "getGroupedMetadataAttributeSummary"
        );
        expect(toolDefinitions[7].parameters.type).toBe("object");
        expect(toolDefinitions[7].parameters.required).toEqual(["attribute"]);
        expect(toolDefinitions[7].strict).toBe(true);
        expect(toolDefinitions[8].name).toBe("searchViewDatums");
        expect(toolDefinitions[8].parameters.type).toBe("object");
        expect(toolDefinitions[8].parameters.required).toEqual([
            "selector",
            "query",
            "field",
            "mode",
        ]);
        expect(toolDefinitions[8].parameters.properties.field).toEqual({
            type: "string",
            description:
                "Search field name. Use an empty string to search all configured fields.",
        });
        expect(toolDefinitions[8].parameters.properties.mode).toEqual({
            type: "string",
            enum: ["exact", "prefix"],
            description:
                "Search mode. `exact` matches the whole field value. `prefix` matches the beginning of the field value.",
        });
        expect(toolDefinitions[8].strict).toBe(true);
        expect(toolDefinitions[9].name).toBe("submitIntentActions");
        expect(toolDefinitions[9].parameters.type).toBe("object");
        expect(toolDefinitions[9].strict).toBe(false);
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

    it("formats a tool rejection with an example payload", () => {
        const message = formatToolCallRejection("setViewVisibility", [
            "$.selector must be of type object.",
            "$.visibility must be of type boolean.",
        ]);

        expect(message).toContain(
            "Tool call was incorrect and rejected. Correct it before trying again."
        );
        expect(message).toContain(
            "setViewVisibility expects selector (ViewSelector), visibility (boolean)."
        );
        expect(message).toContain('"visibility": false');
        expect(message).toContain("Validation errors:");
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
