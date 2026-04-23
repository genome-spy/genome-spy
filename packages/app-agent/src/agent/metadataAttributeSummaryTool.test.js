import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getMetadataAttributeSummaryTool } from "./metadataAttributeSummaryTool.js";

function createRuntimeStub() {
    return {
        getMetadataAttributeSummarySource: vi.fn((attribute) => {
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
