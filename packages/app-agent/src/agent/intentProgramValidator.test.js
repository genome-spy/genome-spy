// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    resolveParamSelector: resolveParamSelectorMock,
}));

import { validateIntentBatch } from "./intentProgramValidator.js";

function createAgentApiStub() {
    return {
        getViewRoot: () => ({}),
        getSampleHierarchy: () => ({ id: "sample-hierarchy" }),
        getAttributeInfo: (attribute) =>
            attribute.specifier === "known"
                ? {
                      name: "known",
                      attribute,
                      title: "Known",
                      emphasizedName: "Known",
                      accessor: () => undefined,
                      valuesProvider: () => [],
                      type: "nominal",
                  }
                : undefined,
    };
}

function mockParamScale(type) {
    resolveParamSelectorMock.mockReturnValue({
        view: {
            getScaleResolution: (channel) =>
                channel === "x" ? { type } : undefined,
        },
    });
}

function paramChangeBatch(interval) {
    return {
        schemaVersion: 1,
        steps: [
            {
                actionType: "paramProvenance/paramChange",
                payload: {
                    selector: { scope: [], param: "brush" },
                    value: {
                        type: "interval",
                        intervals: { x: interval },
                    },
                },
            },
        ],
    };
}

describe("validateIntentBatch", () => {
    beforeEach(() => {
        resolveParamSelectorMock.mockReset();
    });

    it("accepts a valid supported batch", () => {
        const result = validateIntentBatch(createAgentApiStub(), {
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
        const result = validateIntentBatch(createAgentApiStub(), {
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

    it("accepts sample actions with selection-derived aggregation attributes", () => {
        const result = validateIntentBatch(createAgentApiStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/filterByQuantitative",
                    payload: {
                        attribute: {
                            type: "VALUE_AT_LOCUS",
                            specifier: {
                                view: {
                                    scope: [],
                                    view: "track",
                                },
                                field: "beta",
                                interval: {
                                    type: "selection",
                                    selector: {
                                        scope: [],
                                        param: "brush",
                                    },
                                },
                                aggregation: {
                                    op: "max",
                                },
                            },
                        },
                        operator: "gte",
                        operand: 0.6,
                    },
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("rejects unknown action types", () => {
        const result = validateIntentBatch(createAgentApiStub(), {
            schemaVersion: 1,
            steps: [{ actionType: "dropDatabase", payload: {} }],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain("unsupported actionType");
    });

    it("rejects unknown attributes", () => {
        const result = validateIntentBatch(createAgentApiStub(), {
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
        const result = validateIntentBatch(createAgentApiStub(), {
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
        const result = validateIntentBatch(createAgentApiStub(), {
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

    it("rejects numeric interval endpoints for locus-scale selections", () => {
        mockParamScale("locus");

        const result = validateIntentBatch(
            createAgentApiStub(),
            paramChangeBatch([39688083, 39728662])
        );

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            '$.steps[0].payload.value.intervals.x[0] must include a chromosome, for example { "chrom": "chr17", "pos": 39688083 }'
        );
    });

    it("accepts chromosomal locus interval endpoints for locus-scale selections", () => {
        mockParamScale("locus");

        const result = validateIntentBatch(
            createAgentApiStub(),
            paramChangeBatch([
                { chrom: "chr17", pos: 39688083 },
                { chrom: "chr17", pos: 39728662 },
            ])
        );

        expect(result.ok).toBe(true);
    });

    it("accepts numeric interval endpoints for non-locus-scale selections", () => {
        mockParamScale("linear");

        const result = validateIntentBatch(
            createAgentApiStub(),
            paramChangeBatch([0, 100])
        );

        expect(result.ok).toBe(true);
    });
});
