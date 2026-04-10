import { describe, expect, it } from "vitest";
import generatedActionSchema from "../src/agent/generatedActionSchema.json" with {
    type: "json",
};
import generatedActionCatalog from "../src/agent/generatedActionCatalog.json" with {
    type: "json",
};

describe("generatedActionSchema", () => {
    it("covers the current agent action set", () => {
        const stepVariants =
            generatedActionSchema.definitions.AgentIntentProgramStep.anyOf;
        expect(stepVariants).toHaveLength(generatedActionCatalog.length);
        expect(
            stepVariants
                .map((entry) => entry.properties.actionType.const)
                .filter(Boolean)
        ).toEqual(generatedActionCatalog.map((entry) => entry.actionType));

        const groupByThresholds = stepVariants.find(
            (entry) =>
                entry.properties.actionType.const ===
                "sampleView/groupByThresholds"
        );
        expect(groupByThresholds.properties.payload.properties.thresholds.minItems).toBe(
            1
        );

        const retainFirstNCategories = stepVariants.find(
            (entry) =>
                entry.properties.actionType.const ===
                "sampleView/retainFirstNCategories"
        );
        expect(
            retainFirstNCategories.properties.payload.properties.n.type
        ).toBe("number");
        expect(
            retainFirstNCategories.properties.payload.properties.n.minimum
        ).toBe(1);
    });

    it("is valid JSON", () => {
        expect(() => JSON.stringify(generatedActionSchema)).not.toThrow();
    });
});
