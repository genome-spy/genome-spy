// @ts-check
import { describe, expect, it } from "vitest";
import {
    validateActionPayloadShape,
    validateIntentBatchShape,
} from "./actionShapeValidator.js";

describe("actionShapeValidator", () => {
    it("accepts a valid intent batch shape", () => {
        const result = validateIntentBatchShape({
            schemaVersion: 1,
            rationale: "Sort by age",
            steps: [
                {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
                {
                    actionType: "paramProvenance/paramChange",
                    payload: {
                        selector: {
                            scope: [],
                            param: "brush",
                        },
                        value: {
                            type: "value",
                            value: 0.6,
                        },
                    },
                },
                {
                    actionType: "sampleView/groupByThresholds",
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
        const result = validateActionPayloadShape(
            "sampleView/retainFirstNCategories",
            {
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "diagnosis" },
                n: 0,
            }
        );

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            "greater than or equal to 1"
        );
    });

    it("parses escaped JSON strings when an object is expected by an action schema", () => {
        const payload = {
            attribute: '{"type":"SAMPLE_ATTRIBUTE","specifier":"mutations"}',
        };

        const result = validateActionPayloadShape("sampleView/sortBy", payload);

        expect(result.ok).toBe(true);
        expect(payload.attribute).toEqual({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "mutations",
        });
    });

    it("rejects malformed intent batches", () => {
        const result = validateIntentBatchShape({
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/groupByThresholds",
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

    it("does not report unrelated step-branch errors for a known actionType", () => {
        const result = validateIntentBatchShape({
            schemaVersion: 1,
            steps: [
                {
                    actionType: "paramProvenance/paramChange",
                    payload: {
                        selector: {
                            scope: [],
                            param: "brush",
                        },
                        value: {
                            type: "interval",
                            intervals: {
                                x: [
                                    { chrom: "chr17", pos: 43044294 },
                                    { chrom: "chr17", pos: 43125364 },
                                    { chrom: "chr13", pos: 32315507 },
                                    { chrom: "chr13", pos: 32400268 },
                                ],
                            },
                        },
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        const message = result.errors.join("\n");
        expect(message).toContain("must contain exactly 2 item(s)");
        expect(message).not.toContain("sampleView/groupCustomCategories");
    });
});
