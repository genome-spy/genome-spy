// @ts-check
import { describe, expect, it } from "vitest";
import {
    validateAgentActionPayloadShape,
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

    it("accepts selection aggregation candidates only in agent-facing action payloads", () => {
        const payload = {
            attribute: {
                type: "SELECTION_AGGREGATION",
                candidateId: "brush@track:beta",
                aggregation: "max",
            },
        };

        const canonical = validateActionPayloadShape(
            "sampleView/sortBy",
            payload
        );
        const agentFacing = validateAgentActionPayloadShape(
            "sampleView/sortBy",
            payload
        );

        expect(canonical.ok).toBe(false);
        expect(agentFacing.ok).toBe(true);
    });

    it("accepts flat feature filters on selection aggregation candidates", () => {
        const result = validateAgentActionPayloadShape("sampleView/sortBy", {
            attribute: {
                type: "SELECTION_AGGREGATION",
                candidateId: "brush@mutations:VAF",
                aggregation: "max",
                featureFilter: {
                    field: "functionalCategory",
                    operator: "in",
                    values: ["frameshift"],
                },
            },
        });

        expect(result.ok).toBe(true);
    });

    it("rejects hand-written value-at-locus attributes in agent-facing action payloads", () => {
        const result = validateAgentActionPayloadShape("sampleView/sortBy", {
            attribute: {
                type: "VALUE_AT_LOCUS",
                selector: {
                    scope: [],
                    param: "brush",
                },
                aggregation: "count",
            },
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            "uses internal VALUE_AT_LOCUS syntax"
        );
        expect(result.errors.join("\n")).toContain(
            "SELECTION_AGGREGATION candidate copied from selectionAggregation.fields"
        );
    });

    it("explains missing aggregation on selection aggregation candidates", () => {
        const result = validateAgentActionPayloadShape(
            "sampleView/deriveMetadata",
            {
                attribute: {
                    type: "SELECTION_AGGREGATION",
                    candidateId: "brush@CNV:purifiedLogR",
                },
                name: "ERBB2_mean_copy_number",
                scale: null,
            }
        );

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            "$.attribute.aggregation is required for SELECTION_AGGREGATION. Copy a supported aggregation from selectionAggregation.fields; use weightedMean for an interval mean when supported.",
        ]);
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
