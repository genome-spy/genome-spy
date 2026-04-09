import { describe, expect, it } from "vitest";
import {
    buildResponsesToolDefinitions,
    formatToolCallRejection,
    listAgentTools,
    validateToolArgumentsShape,
} from "./toolCatalog.js";

describe("toolCatalog", () => {
    it("exposes the generated planner tools", () => {
        const toolNames = listAgentTools().map((entry) => entry.toolName);

        expect(toolNames).toEqual([
            "expandViewNode",
            "collapseViewNode",
            "setViewVisibility",
            "clearViewVisibility",
            "submitIntentProgram",
        ]);
    });

    it("builds Responses API function tool definitions", () => {
        const toolDefinitions = buildResponsesToolDefinitions();

        expect(toolDefinitions).toHaveLength(5);
        expect(toolDefinitions[0]).toEqual(
            expect.objectContaining({
                type: "function",
                name: "expandViewNode",
                strict: true,
            })
        );
        expect(toolDefinitions[0].parameters.definitions).toBeDefined();
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
