// @ts-check
import { describe, expect, it } from "vitest";
import { validateIntentProgram } from "./intentProgramValidator.js";

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

describe("validateIntentProgram", () => {
    it("accepts a valid supported program", () => {
        const result = validateIntentProgram(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sortBy",
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
        const result = validateIntentProgram(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "groupToQuartiles",
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
        const result = validateIntentProgram(createAppStub(), {
            schemaVersion: 1,
            steps: [{ actionType: "dropDatabase", payload: {} }],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain("unsupported actionType");
    });

    it("rejects unknown attributes", () => {
        const result = validateIntentProgram(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sortBy",
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
        const result = validateIntentProgram(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "filterByQuantitative",
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
        const result = validateIntentProgram(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "groupByThresholds",
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
