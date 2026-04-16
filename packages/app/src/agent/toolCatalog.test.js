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

        expect(toolNames).toEqual(
            expect.arrayContaining([
                "expandViewNode",
                "setViewVisibility",
                "searchViewDatums",
                "submitIntentActions",
            ])
        );
        expect(new Set(toolNames).size).toBe(toolNames.length);
        expect(tools).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    toolName: "jumpToInitialProvenanceState",
                    strict: true,
                }),
                expect.objectContaining({
                    toolName: "submitIntentActions",
                    strict: false,
                }),
            ])
        );
    });

    it("builds Responses API function tool definitions", () => {
        const toolDefinitions = buildResponsesToolDefinitions();

        expect(toolDefinitions).toHaveLength(10);
        expect(toolDefinitions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "function",
                    name: "expandViewNode",
                    strict: true,
                }),
                expect.objectContaining({
                    name: "setViewVisibility",
                    description: expect.stringContaining(
                        "visibility of a view"
                    ),
                    parameters: expect.objectContaining({
                        type: "object",
                    }),
                }),
                expect.objectContaining({
                    name: "submitIntentActions",
                    strict: false,
                }),
            ])
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
