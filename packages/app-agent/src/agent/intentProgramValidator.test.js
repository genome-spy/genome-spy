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
    const attributeTypes = new Map([
        ["diagnosis", "nominal"],
        ["age", "quantitative"],
        ["known", "nominal"],
    ]);

    return {
        getViewRoot: () => ({}),
        getSampleHierarchy: () => ({ id: "sample-hierarchy" }),
        getAttributeInfo: (attribute) => {
            if (attribute.type === "VALUE_AT_LOCUS") {
                return {
                    name: "selection aggregation",
                    attribute,
                    title: "selection aggregation",
                    emphasizedName: "selection aggregation",
                    accessor: () => undefined,
                    valuesProvider: () => [],
                    type: "quantitative",
                };
            }

            const type = attributeTypes.get(attribute.specifier);
            return type
                ? {
                      name: attribute.specifier,
                      attribute,
                      title: attribute.specifier,
                      emphasizedName: attribute.specifier,
                      accessor: () => undefined,
                      valuesProvider: () => [],
                      type,
                  }
                : undefined;
        },
    };
}

function mockParamScale(type) {
    resolveParamSelectorMock.mockReturnValue({
        param: {
            name: "brush",
            select: { type: "interval" },
        },
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
                            specifier: "age",
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
                            specifier: "age",
                        },
                    },
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("rejects nominal grouping for a quantitative attribute", () => {
        const result = validateIntentBatch(createAgentApiStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/groupByNominal",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            "sampleView/groupByNominal requires nominal or ordinal attributes"
        );
        expect(result.errors.join("\n")).toContain(
            '"age" has type quantitative'
        );
    });

    it("rejects quantitative grouping for a nominal attribute", () => {
        const result = validateIntentBatch(createAgentApiStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/groupToQuartiles",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "diagnosis",
                        },
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            "sampleView/groupToQuartiles requires quantitative attributes"
        );
        expect(result.errors.join("\n")).toContain(
            '"diagnosis" has type nominal'
        );
    });

    it("rejects nominal grouping for a quantitative selection-derived attribute", () => {
        const result = validateIntentBatch(createAgentApiStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/groupByNominal",
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
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            "sampleView/groupByNominal requires nominal or ordinal attributes"
        );
        expect(result.errors.join("\n")).toContain("has type quantitative");
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

    it("rejects param changes that change an interval selection to a literal value", () => {
        mockParamScale("linear");

        const result = validateIntentBatch(createAgentApiStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "paramProvenance/paramChange",
                    payload: {
                        selector: { scope: [], param: "brush" },
                        value: { type: "value", value: null },
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toContain(
            '$.steps[0].payload.value.type must be "interval"'
        );
    });
});
