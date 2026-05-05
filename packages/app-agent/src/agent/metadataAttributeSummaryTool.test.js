import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getMetadataAttributeSummaryTool } from "./metadataAttributeSummaryTool.js";

vi.mock("@genome-spy/app/agentShared", () => ({
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
}));

function createRuntimeStub() {
    return {
        getMetadataAttributeSummarySource: vi.fn((attribute) => {
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
        getGroupedMetadataAttributeSummarySource: vi.fn((attribute) => {
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

describe("metadataAttributeSummaryTool", () => {
    it("returns richer quantitative summaries for visible samples", () => {
        const result = getMetadataAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual({
            kind: "metadata_attribute_summary",
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
        });
    });

    it("returns categorical shares for visible samples", () => {
        const result = getMetadataAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual({
            kind: "metadata_attribute_summary",
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
        const result = getMetadataAttributeSummaryTool(runtime, {
            attribute: {
                type: "SELECTION_AGGREGATION",
                candidateId: "brush@track:beta",
                aggregation: "max",
            },
            scope: "visible_samples",
        });

        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "metadata_attribute_summary",
                title: "max(beta)",
                dataType: "quantitative",
                sampleCount: 2,
                nonMissingCount: 2,
                min: 0.2,
                max: 0.8,
            })
        );
        expect(runtime.getMetadataAttributeSummarySource).toHaveBeenCalledWith({
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

    it("returns categorical shares for visible groups", () => {
        const result = getMetadataAttributeSummaryTool(createRuntimeStub(), {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "tissue",
            },
            scope: "visible_groups",
        });

        expect(result.content).toEqual({
            kind: "grouped_metadata_attribute_summary",
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
            getMetadataAttributeSummaryTool(
                {
                    getMetadataAttributeSummarySource: vi.fn(),
                    getGroupedMetadataAttributeSummarySource: vi.fn(() => ({
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
