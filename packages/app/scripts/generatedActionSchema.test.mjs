import { describe, expect, it } from "vitest";
import generatedActionSchema from "../src/agent/generatedActionSchema.json" with {
    type: "json",
};
import { generatedActionCatalog } from "../src/agent/generatedActionCatalog.js";

describe("generatedActionSchema", () => {
    it("covers the current agent action set", () => {
        expect(generatedActionSchema.definitions.AgentIntentProgramStep.anyOf).toHaveLength(
            generatedActionCatalog.length
        );
        expect(
            generatedActionSchema.definitions.AgentIntentProgramStep.anyOf.map((entry) =>
                entry.properties.actionType.const
            )
        ).toEqual(generatedActionCatalog.map((entry) => entry.actionType));
        expect(
            generatedActionSchema.definitions.GroupByThresholds.properties.thresholds.minItems
        ).toBe(1);
        expect(
            generatedActionSchema.definitions.RetainFirstNCategories.properties.n.type
        ).toBe("number");
        expect(
            generatedActionSchema.definitions.RetainFirstNCategories.properties.n.minimum
        ).toBe(1);
    });

    it("is valid JSON", () => {
        expect(() => JSON.stringify(generatedActionSchema)).not.toThrow();
    });
});
