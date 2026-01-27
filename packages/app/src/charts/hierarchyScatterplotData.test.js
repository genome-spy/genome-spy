import { describe, expect, it } from "vitest";
import { buildHierarchyScatterplotData } from "./hierarchyScatterplotData.js";
import { createDefaultValuesProvider } from "../sampleView/attributeValues.js";

/**
 * @returns {import("../sampleView/state/sampleState.js").SampleHierarchy}
 */
function createSampleHierarchy() {
    return {
        sampleData: {
            ids: ["s1", "s2", "s3", "s4"],
            entities: {
                s1: { id: "s1" },
                s2: { id: "s2" },
                s3: { id: "s3" },
                s4: { id: "s4" },
            },
        },
        sampleMetadata: {
            entities: {
                s1: { a: 1, b: 10 },
                s2: { a: 2, b: 11 },
                s3: { a: 3, b: null },
                s4: { a: 4, b: 13 },
            },
            attributeNames: ["a", "b"],
        },
        groupMetadata: [],
        rootGroup: {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "A",
                    title: "Group A",
                    samples: ["s1", "s2"],
                },
                {
                    name: "B",
                    title: "Group B",
                    samples: ["s3", "s4"],
                },
            ],
        },
    };
}

describe("buildHierarchyScatterplotData", () => {
    it("builds rows for quantitative attributes and drops missing values", () => {
        const sampleHierarchy = createSampleHierarchy();
        const xAttributeInfo = {
            name: "a",
            title: "a",
            emphasizedName: "a",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "a" },
            accessor: (sampleId, hierarchy) =>
                hierarchy.sampleMetadata.entities[sampleId]?.a,
            valuesProvider: createDefaultValuesProvider(
                (sampleId, hierarchy) =>
                    hierarchy.sampleMetadata.entities[sampleId]?.a
            ),
            type: "quantitative",
        };
        const yAttributeInfo = {
            name: "b",
            title: "b",
            emphasizedName: "b",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "b" },
            accessor: (sampleId, hierarchy) =>
                hierarchy.sampleMetadata.entities[sampleId]?.b,
            valuesProvider: createDefaultValuesProvider(
                (sampleId, hierarchy) =>
                    hierarchy.sampleMetadata.entities[sampleId]?.b
            ),
            type: "quantitative",
        };

        const { rows, groupDomain } = buildHierarchyScatterplotData(
            sampleHierarchy,
            xAttributeInfo,
            yAttributeInfo
        );

        expect(groupDomain).toEqual(["Group A", "Group B"]);
        expect(rows).toEqual([
            { sampleId: "s1", x: 1, y: 10, group: "Group A" },
            { sampleId: "s2", x: 2, y: 11, group: "Group A" },
            { sampleId: "s4", x: 4, y: 13, group: "Group B" },
        ]);
    });

    it("rejects non-quantitative attributes", () => {
        const sampleHierarchy = createSampleHierarchy();
        const xAttributeInfo = {
            name: "a",
            title: "a",
            emphasizedName: "a",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "a" },
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
        };
        const yAttributeInfo = {
            name: "b",
            title: "b",
            emphasizedName: "b",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "b" },
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "quantitative",
        };

        expect(() =>
            buildHierarchyScatterplotData(
                sampleHierarchy,
                xAttributeInfo,
                yAttributeInfo
            )
        ).toThrow("Scatterplot requires quantitative attributes.");
    });
});
