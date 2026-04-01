// @ts-check
import { describe, expect, it } from "vitest";
import {
    validateActionPayloadShape,
    validateIntentProgramShape,
} from "./actionShapeValidator.js";

describe("actionShapeValidator", () => {
    it("accepts a valid intent program shape", () => {
        const result = validateIntentProgramShape({
            schemaVersion: 1,
            rationale: "Sort by age",
            needsConfirmation: false,
            steps: [
                {
                    actionType: "sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
                {
                    actionType: "groupByThresholds",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "purity",
                        },
                        thresholds: [
                            { operator: "lte", operand: 0.2 },
                            { operator: "lt", operand: 0.8 },
                        ],
                    },
                },
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it("rejects malformed payload shapes", () => {
        const result = validateActionPayloadShape("retainFirstNCategories", {
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "diagnosis" },
            n: 0,
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            "greater than or equal to 1"
        );
    });

    it("rejects malformed intent programs", () => {
        const result = validateIntentProgramShape({
            schemaVersion: 1,
            steps: [
                {
                    actionType: "groupByThresholds",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "purity",
                        },
                        thresholds: [],
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain("at least 1 item");
    });
});
