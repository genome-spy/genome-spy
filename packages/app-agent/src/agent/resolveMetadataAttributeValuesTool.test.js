import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError } from "./agentToolErrors.js";

vi.mock("@genome-spy/app/agentShared", () => ({
    templateResultToString: (value) => String(value),
}));

import { resolveMetadataAttributeValuesTool } from "./resolveMetadataAttributeValuesTool.js";

function createRuntimeStub() {
    const sampleHierarchy = {
        sampleData: {
            ids: ["sampleA", "sampleB", "sampleC", "sampleD"],
            entities: {},
        },
        sampleMetadata: {
            attributeNames: ["timepoint", "status", "purity"],
            entities: {
                sampleA: {
                    timepoint: "relapse",
                    status: "treated",
                    purity: 0.8,
                },
                sampleB: { timepoint: "relapse", status: "naive", purity: 0.7 },
                sampleC: {
                    timepoint: "baseline",
                    status: "relapse",
                    purity: 0.9,
                },
                sampleD: {
                    timepoint: "baseline",
                    status: "treated",
                    purity: 0.6,
                },
            },
        },
        groupMetadata: [],
        rootGroup: {
            name: "ROOT",
            title: "ROOT",
            groups: [
                {
                    name: "visible",
                    title: "visible",
                    samples: ["sampleA", "sampleB", "sampleC"],
                },
            ],
        },
    };

    return {
        agentApi: {
            getSampleHierarchy: vi.fn(() => sampleHierarchy),
            getAttributeInfo: vi.fn((attribute) => ({
                attribute,
                title: attribute.specifier,
                emphasizedName: String(attribute.specifier),
                accessor: () => undefined,
                valuesProvider: () => [],
                type:
                    attribute.specifier === "purity"
                        ? "quantitative"
                        : "nominal",
            })),
        },
    };
}

describe("resolveMetadataAttributeValuesTool", () => {
    it("returns exact categorical metadata matches", () => {
        const result = resolveMetadataAttributeValuesTool(createRuntimeStub(), {
            query: "relapse",
        });

        expect(result).toEqual({
            text: 'Resolved 2 metadata matches for "relapse".',
            content: {
                kind: "metadata_attribute_value_resolution",
                query: "relapse",
                count: 2,
                matches: [
                    {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "timepoint",
                        },
                        title: "timepoint",
                        dataType: "nominal",
                        matchedValue: "relapse",
                        matchType: "exact",
                        visibleSampleCount: 2,
                    },
                    {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "status",
                        },
                        title: "status",
                        dataType: "nominal",
                        matchedValue: "relapse",
                        matchType: "exact",
                        visibleSampleCount: 1,
                    },
                ],
            },
        });
    });

    it("returns bounded Levenshtein matches for minor typos", () => {
        const result = resolveMetadataAttributeValuesTool(createRuntimeStub(), {
            query: "relaps",
        });

        expect(result.content).toEqual({
            kind: "metadata_attribute_value_resolution",
            query: "relaps",
            count: 2,
            matches: [
                {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "timepoint",
                    },
                    title: "timepoint",
                    dataType: "nominal",
                    matchedValue: "relapse",
                    matchType: "levenshtein",
                    distance: 1,
                    visibleSampleCount: 2,
                },
                {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "status",
                    },
                    title: "status",
                    dataType: "nominal",
                    matchedValue: "relapse",
                    matchType: "levenshtein",
                    distance: 1,
                    visibleSampleCount: 1,
                },
            ],
        });
    });

    it("rejects empty queries", () => {
        expect(() =>
            resolveMetadataAttributeValuesTool(createRuntimeStub(), {
                query: "  ",
            })
        ).toThrow(ToolCallRejectionError);
    });
});
