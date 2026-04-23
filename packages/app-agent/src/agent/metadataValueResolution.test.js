import { describe, expect, it, vi } from "vitest";
import { resolveMetadataValueMatches } from "./metadataValueResolution.js";

function createSampleHierarchy() {
    return {
        sampleData: {
            ids: ["s1", "s2", "s3", "s4", "s5"],
            entities: {},
        },
        sampleMetadata: {
            attributeNames: ["timepoint", "status", "purity", "response"],
            entities: {
                s1: {
                    timepoint: "relapse",
                    status: "treated",
                    purity: 0.7,
                    response: "yes",
                },
                s2: {
                    timepoint: "relapse",
                    status: "naive",
                    purity: 0.9,
                    response: "no",
                },
                s3: {
                    timepoint: "baseline",
                    status: "relapse",
                    purity: 0.8,
                    response: "yes",
                },
                s4: {
                    timepoint: "baseline",
                    status: "naive",
                    purity: 0.6,
                    response: "yes",
                },
                s5: {
                    timepoint: "relapse",
                    status: "treated",
                    purity: 0.5,
                    response: "no",
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
                    samples: ["s1", "s2", "s3", "s4"],
                },
            ],
        },
    };
}

function createGetAttributeInfo() {
    return vi.fn((attribute) => ({
        attribute,
        title: attribute.specifier,
        emphasizedName: String(attribute.specifier),
        accessor: () => undefined,
        valuesProvider: () => [],
        type: attribute.specifier === "purity" ? "quantitative" : "nominal",
    }));
}

describe("resolveMetadataValueMatches", () => {
    it("returns exact categorical matches from visible samples", () => {
        const matches = resolveMetadataValueMatches({
            sampleHierarchy: createSampleHierarchy(),
            getAttributeInfo: createGetAttributeInfo(),
            query: "relapse",
        });

        expect(matches).toEqual([
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
        ]);
    });

    it("falls back to bounded Levenshtein matches for minor typos", () => {
        const matches = resolveMetadataValueMatches({
            sampleHierarchy: createSampleHierarchy(),
            getAttributeInfo: createGetAttributeInfo(),
            query: "relaps",
        });

        expect(matches).toEqual([
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
        ]);
    });

    it("does not return fuzzy matches for very short queries", () => {
        const matches = resolveMetadataValueMatches({
            sampleHierarchy: createSampleHierarchy(),
            getAttributeInfo: createGetAttributeInfo(),
            query: "ys",
        });

        expect(matches).toEqual([]);
    });

    it("excludes quantitative attributes from categorical value resolution", () => {
        const matches = resolveMetadataValueMatches({
            sampleHierarchy: createSampleHierarchy(),
            getAttributeInfo: createGetAttributeInfo(),
            query: "0.7",
        });

        expect(matches).toEqual([]);
    });
});
