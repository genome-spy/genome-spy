// @ts-check
import { describe, expect, it } from "vitest";
import { buildHierarchyBarplotData } from "./hierarchyBarplotData.js";
import { createDefaultValuesProvider } from "../sampleView/attributeValues.js";

/**
 * @returns {import("../sampleView/state/sampleState.js").SampleHierarchy}
 */
function createSampleHierarchy() {
    return {
        sampleData: {
            ids: ["s1", "s2", "s3", "s4"],
            entities: {
                s1: { id: "s1", displayName: "S1", indexNumber: 0 },
                s2: { id: "s2", displayName: "S2", indexNumber: 1 },
                s3: { id: "s3", displayName: "S3", indexNumber: 2 },
                s4: { id: "s4", displayName: "S4", indexNumber: 3 },
            },
        },
        sampleMetadata: {
            entities: {
                s1: { status: "A" },
                s2: { status: "B" },
                s3: { status: "A" },
                s4: { status: null },
            },
            attributeNames: ["status"],
        },
        groupMetadata: [],
        rootGroup: {
            name: "ROOT",
            title: "Root",
            samples: ["s1", "s2", "s3", "s4"],
        },
    };
}

describe("buildHierarchyBarplotData", () => {
    it("counts categories when ungrouped", () => {
        const sampleHierarchy = createSampleHierarchy();
        const attributeInfo = {
            name: "status",
            title: "status",
            emphasizedName: "status",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "status" },
            accessor: (sampleId, hierarchy) =>
                hierarchy.sampleMetadata.entities[sampleId]?.status,
            valuesProvider: createDefaultValuesProvider(
                (sampleId, hierarchy) =>
                    hierarchy.sampleMetadata.entities[sampleId]?.status
            ),
            type: "nominal",
        };

        const { rows, categoryDomain, groupDomain, grouped } =
            buildHierarchyBarplotData(sampleHierarchy, attributeInfo);

        expect(grouped).toBe(false);
        expect(groupDomain).toEqual([]);
        expect(categoryDomain).toEqual(["A", "B"]);
        expect(rows).toEqual([
            { category: "A", Count: 2 },
            { category: "B", Count: 1 },
        ]);
    });

    it("counts categories per group when grouped", () => {
        const sampleHierarchy = createSampleHierarchy();
        sampleHierarchy.rootGroup = {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "G1",
                    title: "Group 1",
                    samples: ["s1", "s2"],
                },
                {
                    name: "G2",
                    title: "Group 2",
                    samples: ["s3", "s4"],
                },
            ],
        };

        const attributeInfo = {
            name: "status",
            title: "status",
            emphasizedName: "status",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "status" },
            accessor: (sampleId, hierarchy) =>
                hierarchy.sampleMetadata.entities[sampleId]?.status,
            valuesProvider: createDefaultValuesProvider(
                (sampleId, hierarchy) =>
                    hierarchy.sampleMetadata.entities[sampleId]?.status
            ),
            type: "nominal",
        };

        const { rows, categoryDomain, groupDomain, grouped } =
            buildHierarchyBarplotData(sampleHierarchy, attributeInfo);

        expect(grouped).toBe(true);
        expect(groupDomain).toEqual(["Group 1", "Group 2"]);
        expect(categoryDomain).toEqual(["A", "B"]);
        expect(rows).toEqual([
            { category: "A", Count: 1, group: "Group 1" },
            { category: "B", Count: 1, group: "Group 1" },
            { category: "A", Count: 1, group: "Group 2" },
        ]);
    });
});
