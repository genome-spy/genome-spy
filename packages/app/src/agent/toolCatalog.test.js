import { describe, expect, it } from "vitest";
import {
    buildResponsesToolDefinitions,
    formatToolCallRejection,
    listAgentTools,
    validateToolArgumentsShape,
} from "./toolCatalog.js";

describe("toolCatalog", () => {
    it("exposes the generated planner tools", () => {
        const tools = listAgentTools();
        const toolNames = tools.map((entry) => entry.toolName);

        expect(toolNames).toEqual([
            "expandViewNode",
            "collapseViewNode",
            "setViewVisibility",
            "clearViewVisibility",
            "jumpToProvenanceState",
            "jumpToInitialProvenanceState",
            "resolveSelectionAggregationCandidate",
            "submitIntentProgram",
        ]);
        expect(tools[4].strict).toBe(true);
        expect(tools[5].strict).toBe(true);
        expect(tools[6].strict).toBe(true);
        expect(tools[7].strict).toBe(false);
    });

    it("builds Responses API function tool definitions", () => {
        const toolDefinitions = buildResponsesToolDefinitions();

        expect(toolDefinitions).toHaveLength(8);
        expect(toolDefinitions[0]).toEqual(
            expect.objectContaining({
                type: "function",
                name: "expandViewNode",
                strict: true,
            })
        );
        expect(JSON.stringify(toolDefinitions)).not.toContain(
            "AgentIntentProgramStep"
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
        expect(toolDefinitions[4].name).toBe("jumpToProvenanceState");
        expect(toolDefinitions[4].parameters.type).toBe("object");
        expect(toolDefinitions[4].strict).toBe(true);
        expect(toolDefinitions[5].name).toBe("jumpToInitialProvenanceState");
        expect(toolDefinitions[5].parameters.type).toBe("object");
        expect(toolDefinitions[5].parameters.properties).toEqual({});
        expect(toolDefinitions[5].strict).toBe(true);
        expect(toolDefinitions[6].name).toBe(
            "resolveSelectionAggregationCandidate"
        );
        expect(toolDefinitions[6].parameters.type).toBe("object");
        expect(toolDefinitions[6].strict).toBe(true);
        expect(toolDefinitions[7].parameters.type).toBe("object");
        expect(toolDefinitions[7].strict).toBe(false);
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
});
