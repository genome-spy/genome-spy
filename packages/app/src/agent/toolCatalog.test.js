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
        expect(
            tools.every(
                ({ toolName, description, inputFields, strict }) =>
                    typeof toolName === "string" &&
                    typeof description === "string" &&
                    Array.isArray(inputFields) &&
                    typeof strict === "boolean"
            )
        ).toBe(true);
        expect(
            tools.some(
                ({ toolName, strict }) =>
                    toolName === "jumpToInitialProvenanceState" &&
                    strict === true
            )
        ).toBe(true);
        expect(
            tools.some(
                ({ toolName, strict }) =>
                    toolName === "submitIntentActions" && strict === false
            )
        ).toBe(true);
    });

    it("builds Responses API function tool definitions", () => {
        const toolDefinitions = buildResponsesToolDefinitions();
        const jumpToInitialProvenanceState = toolDefinitions.find(
            (tool) => tool.name === "jumpToInitialProvenanceState"
        );
        const submitIntentActions = toolDefinitions.find(
            (tool) => tool.name === "submitIntentActions"
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
        expect(JSON.stringify(toolDefinitions)).not.toContain(
            "AgentIntentBatchStep"
        );
        expect(JSON.stringify(toolDefinitions)).not.toContain('"not":{}');
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
