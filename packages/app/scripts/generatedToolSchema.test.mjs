import { describe, expect, it } from "vitest";
import generatedToolSchema from "../src/agent/generated/generatedToolSchema.json" with {
    type: "json",
};
import generatedToolCatalog from "../src/agent/generated/generatedToolCatalog.json" with {
    type: "json",
};

describe("generatedToolSchema", () => {
    it("covers the current tool set", () => {
        expect(generatedToolSchema.$ref).toBe("#/definitions/AgentToolInputs");
        expect(
            generatedToolSchema.definitions.AgentToolInputs.properties
        ).toBeDefined();
        expect(
            Object.keys(
                generatedToolSchema.definitions.AgentToolInputs.properties
            ).sort()
        ).toEqual(
            generatedToolCatalog.map((entry) => entry.toolName).sort()
        );
    });

    it("is valid JSON", () => {
        expect(() => JSON.stringify(generatedToolSchema)).not.toThrow();
    });
});
