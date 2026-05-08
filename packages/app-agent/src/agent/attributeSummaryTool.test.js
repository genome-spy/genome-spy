import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getAttributeSummaryTool } from "./attributeSummaryTool.js";

vi.mock("@genome-spy/app/agentShared", async (importOriginal) => {
    const actual = await importOriginal();

    return {
        ...actual,
        buildSelectionAggregationAttributeIdentifier: ({
            viewSelector,
            field,
            selectionSelector,
            aggregation,
        }) => ({
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: viewSelector,
                field,
                interval: {
                    type: "selection",
                    selector: selectionSelector,
                },
                aggregation: { op: aggregation },
            },
        }),
        formatAggregationExpression: (aggregation, field) =>
            `${aggregation}(${field})`,
    };
});

function createRuntimeStub() {
    return {
        getAttributeSummarySource: vi.fn((attribute) => {
            if (attribute.type === "VALUE_AT_LOCUS") {
                return {
                    attribute,
                    title: "max(beta)",
                    dataType: "quantitative",
                    scope: "visible_samples",
                    sampleIds: ["sampleA", "sampleB"],
                    values: [0.2, 0.8],
                };
            }

            if (attribute.specifier === "age") {
                return {
                    attribute,
                    title: "age",
                    dataType: "quantitative",
                    scope: "visible_samples",
                    sampleIds: ["sampleA", "sampleB", "sampleC", "sampleD"],
                    values: [10, "20", undefined, 40],
                };
            }

            if (attribute.specifier === "eventCount") {
                return {
                    attribute,
                    title: "event count",
                    dataType: "quantitative",
                    scope: "visible_samples",
                    sampleIds: [
                        "sampleA",
                        "sampleB",
                        "sampleC",
                        "sampleD",
                        "sampleE",
                    ],
                    values: [0, 0, 1, 2, undefined],
                };
            }

            if (attribute.specifier === "continuous") {
                return {
                    attribute,
                    title: "continuous",
                    dataType: "quantitative",
                    scope: "visible_samples",
                    sampleIds: Array.from(
                        { length: 25 },
                        (_, index) => `sample${index}`
                    ),
                    values: Array.from({ length: 25 }, (_, index) => index),
                };
            }

            if (attribute.specifier === "sex") {
                return {
                    attribute,
                    title: "sex",
                    dataType: "nominal",
                    scope: "visible_samples",
                    sampleIds: ["sampleA", "sampleB", "sampleC"],
                    values: ["F", "M", "F"],
                };
            }

            return undefined;
        }),
        getGroupedAttributeSummarySource: vi.fn((attribute) => {
            if (attribute.type === "VALUE_AT_LOCUS") {
                return {
                    attribute,
                    title: "max(beta)",
                    dataType: "quantitative",
                    scope: "visible_groups",
                    groupLevels: [
                        {
                            level: 0,
                            attribute: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "diagnosis",
                            },
                            title: "diagnosis",
                        },
                    ],
                    groups: [
                        {
                            path: ["A"],
                            titles: ["A"],
                            title: "A",
                            sampleIds: ["sampleA", "sampleB"],
                        },
                    ],
                    valuesBySampleId: {
                        sampleA: 0.2,
                        sampleB: 0.8,
                    },
                };
            }

            if (attribute.specifier !== "tissue") {
                return undefined;
            }

            return {
                attribute,
                title: "tissue",
                dataType: "nominal",
                scope: "visible_groups",
                groupLevels: [
                    {
                        level: 0,
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "diagnosis",
                        },
                        title: "diagnosis",
                    },
                ],
                groups: [
                    {
                        path: ["A"],
                        titles: ["A"],
                        title: "A",
                        sampleIds: ["sampleA", "sampleB"],
                    },
                    {
                        path: ["B"],
                        titles: ["B"],
                        title: "B",
                        sampleIds: ["sampleC"],
                    },
                ],
                valuesBySampleId: {
                    sampleA: "blood",
                    sampleB: "blood",
                    sampleC: "bone marrow",
                },
            };
        }),
        getAgentVolatileContext: vi.fn(() => ({
            selectionAggregation: {
                fields: [
                    {
                        candidateId: "brush@track:beta",
                        viewSelector: {
                            scope: [],
                            view: "track",
                        },
                        selectionSelector: {
                            scope: [],
                            param: "brush",
                        },
                        field: "beta",
                        supportedAggregations: ["max"],
                    },
                ],
            },
        })),
    };
}

describe("attributeSummaryTool", () => {
    it("returns richer quantitative summaries for visible samples", () => {
        const result = getAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual({
            kind: "attribute_summary",
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            title: "age",
            dataType: "quantitative",
            scope: "visible_samples",
            sampleCount: 4,
            nonMissingCount: 3,
            missingCount: 1,
            min: 10,
            max: 40,
            mean: 70 / 3,
            median: 20,
            p05: 11,
            p95: 38,
            q1: 15,
            q3: 30,
            iqr: 15,
            negativeCount: 0,
            zeroCount: 0,
            positiveCount: 3,
            nonZeroCount: 3,
            negativeShare: 0,
            zeroShare: 0,
            positiveShare: 1,
            nonZeroShare: 1,
            valueDistribution: {
                kind: "value_counts",
                distinctCount: 3,
                counts: [
                    { value: 10, count: 1, share: 1 / 3 },
                    { value: 20, count: 1, share: 1 / 3 },
                    { value: 40, count: 1, share: 1 / 3 },
                ],
            },
        });
    });

    it("returns sign and zero-count helpers for sparse quantitative values", () => {
        const result = getAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "eventCount",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                nonMissingCount: 4,
                missingCount: 1,
                zeroCount: 2,
                positiveCount: 2,
                nonZeroCount: 2,
                zeroShare: 0.5,
                positiveShare: 0.5,
                nonZeroShare: 0.5,
                valueDistribution: {
                    kind: "value_counts",
                    distinctCount: 3,
                    counts: [
                        { value: 0, count: 2, share: 0.5 },
                        { value: 1, count: 1, share: 0.25 },
                        { value: 2, count: 1, share: 0.25 },
                    ],
                },
            })
        );
    });

    it("returns bounded histogram bins for high-cardinality quantitative values", () => {
        const result = getAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "continuous",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                valueDistribution: {
                    kind: "histogram",
                    distinctCount: 25,
                    binning: {
                        start: 0,
                        stop: 25,
                        step: 5,
                    },
                    bins: [
                        { bin: [0, 5], count: 5, share: 5 / 25 },
                        { bin: [5, 10], count: 5, share: 5 / 25 },
                        { bin: [10, 15], count: 5, share: 5 / 25 },
                        { bin: [15, 20], count: 5, share: 5 / 25 },
                        { bin: [20, 25], count: 5, share: 5 / 25 },
                    ],
                },
            })
        );
    });

    it("returns categorical shares for visible samples", () => {
        const result = getAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual({
            kind: "attribute_summary",
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            title: "sex",
            dataType: "nominal",
            scope: "visible_samples",
            sampleCount: 3,
            nonMissingCount: 3,
            missingCount: 0,
            distinctCount: 2,
            categories: [
                { value: "F", count: 2, share: 2 / 3 },
                { value: "M", count: 1, share: 1 / 3 },
            ],
            truncated: false,
        });
    });

    it("summarizes selection aggregation candidates", () => {
        const runtime = createRuntimeStub();
        const result = getAttributeSummaryTool(runtime, {
            attribute: {
                type: "SELECTION_AGGREGATION",
                candidateId: "brush@track:beta",
                aggregation: "max",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "attribute_summary",
                title: "max(beta)",
                dataType: "quantitative",
                sampleCount: 2,
                nonMissingCount: 2,
                min: 0.2,
                max: 0.8,
                selectionAggregation: {
                    op: "max",
                    valueLevel: "sample",
                    summaryLevel: "visible_samples",
                    interpretation:
                        "Each value was first aggregated over the selected interval for one sample; these summary statistics describe the distribution of those per-sample values across visible samples.",
                    nextStepHint:
                        'For deeper comparison, first group samples with an intent action, then call getAttributeSummary again with scope: "visible_groups".',
                },
            })
        );
        expect(runtime.getAttributeSummarySource).toHaveBeenCalledWith({
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
                aggregation: { op: "max" },
            },
        });
    });

    it("summarizes grouped selection aggregation candidates", () => {
        const result = getAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SELECTION_AGGREGATION",
                candidateId: "brush@track:beta",
                aggregation: "max",
            },
            scope: "visible_groups",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "grouped_attribute_summary",
                title: "max(beta)",
                dataType: "quantitative",
                scope: "visible_groups",
                selectionAggregation: {
                    op: "max",
                    valueLevel: "sample",
                    summaryLevel: "visible_groups",
                    interpretation:
                        "Each value was first aggregated over the selected interval for one sample; each group summary describes the distribution of those per-sample values within that visible group.",
                    nextStepHint:
                        "Compare group-level distributions; do not interpret a pooled mean as a sample count.",
                },
            })
        );
    });

    it("returns categorical shares for visible groups", () => {
        const result = getAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "tissue",
            },
            scope: "visible_groups",
        });

        expect(result.content).toEqual({
            kind: "grouped_attribute_summary",
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "tissue",
            },
            title: "tissue",
            dataType: "nominal",
            scope: "visible_groups",
            groupLevels: [
                {
                    level: 0,
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "diagnosis",
                    },
                    title: "diagnosis",
                },
            ],
            groupCount: 2,
            groups: [
                {
                    path: ["A"],
                    titles: ["A"],
                    title: "A",
                    nonMissingCount: 2,
                    missingCount: 0,
                    distinctCount: 1,
                    categories: [{ value: "blood", count: 2, share: 1 }],
                    truncated: false,
                },
                {
                    path: ["B"],
                    titles: ["B"],
                    title: "B",
                    nonMissingCount: 1,
                    missingCount: 0,
                    distinctCount: 1,
                    categories: [{ value: "bone marrow", count: 1, share: 1 }],
                    truncated: false,
                },
            ],
            truncatedGroups: false,
        });
    });

    it("rejects grouped summaries when no visible groups exist", () => {
        expect(() =>
            getAttributeSummaryTool(
                {
                    getAttributeSummarySource: vi.fn(),
                    getGroupedAttributeSummarySource: vi.fn(() => ({
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "tissue",
                        },
                        title: "tissue",
                        dataType: "nominal",
                        scope: "visible_groups",
                        groupLevels: [],
                        groups: [],
                        valuesBySampleId: {},
                    })),
                },
                {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "tissue",
                    },
                    scope: "visible_groups",
                }
            )
        ).toThrow(ToolCallRejectionError);
    });
});
