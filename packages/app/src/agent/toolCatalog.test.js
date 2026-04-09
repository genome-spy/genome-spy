import { describe, expect, it } from "vitest";
import {
    buildResponsesToolDefinitions,
    listAgentTools,
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
});
