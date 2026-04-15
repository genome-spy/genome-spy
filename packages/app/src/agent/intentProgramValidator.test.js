// @ts-nocheck
import { describe, expect, it } from "vitest";
import { validateIntentBatch } from "./intentProgramValidator.js";

function createAppStub() {
    return {
        getSampleView: () => ({
            compositeAttributeInfoSource: {
                getAttributeInfo: (attribute) => {
                    if (attribute.specifier === "known") {
                        return {
                            name: "known",
                            attribute,
                            title: "Known",
                            emphasizedName: "Known",
                            accessor: () => undefined,
                            valuesProvider: () => [],
                            type: "nominal",
                        };
                    }

                    throw new Error("Unknown attribute");
                },
            },
        }),
    };
}

describe("validateIntentBatch", () => {
    it("accepts a valid supported batch", () => {
        const result = validateIntentBatch(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "known",
                        },
                    },
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("accepts quartile grouping for a quantitative attribute", () => {
        const result = validateIntentBatch(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/groupToQuartiles",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "known",
                        },
                    },
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("rejects unknown action types", () => {
        const result = validateIntentBatch(createAppStub(), {
            schemaVersion: 1,
            steps: [{ actionType: "dropDatabase", payload: {} }],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain("unsupported actionType");
    });

    it("rejects unknown attributes", () => {
        const result = validateIntentBatch(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "missing",
                        },
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain("unknown attribute");
    });

    it("rejects malformed quantitative filters", () => {
        const result = validateIntentBatch(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/filterByQuantitative",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "known",
                        },
                        operator: "approximately",
                        operand: "high",
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain("payload.operator");
        expect(result.errors.join("\n")).toContain("payload.operand");
    });

    it("rejects malformed threshold groupings", () => {
        const result = validateIntentBatch(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/groupByThresholds",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "known",
                        },
                        thresholds: [
                            {
                                operator: "approximately",
                                operand: "high",
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            "payload.thresholds[0].operator"
        );
        expect(result.errors.join("\n")).toContain(
            "payload.thresholds[0].operand"
        );
    });
});
