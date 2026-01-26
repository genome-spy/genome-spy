import { describe, expect, it } from "vitest";
import { buildHierarchyBoxplotData } from "./hierarchyBoxplotData.js";

/**
 * @returns {import("../sampleView/state/sampleState.js").SampleHierarchy}
 */
function createSampleHierarchy() {
    return {
        sampleData: {
            ids: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"],
            entities: {
                s1: { id: "s1" },
                s2: { id: "s2" },
                s3: { id: "s3" },
                s4: { id: "s4" },
                s5: { id: "s5" },
                s6: { id: "s6" },
                s7: { id: "s7" },
                s8: { id: "s8" },
                s9: { id: "s9" },
            },
        },
        sampleMetadata: {
            entities: {
                s1: { score: 1 },
                s2: { score: 2 },
                s3: { score: 3 },
                s4: { score: 4 },
                s5: { score: 100 },
                s6: { score: 10 },
                s7: { score: 11 },
                s8: { score: 12 },
                s9: { score: 13 },
            },
            attributeNames: ["score"],
        },
        groupMetadata: [],
        rootGroup: {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "A",
                    title: "Group A",
                    groups: [
                        {
                            name: "A1",
                            title: "Sub A",
                            samples: ["s1", "s2", "s3", "s4", "s5"],
                        },
                    ],
                },
                {
                    name: "B",
                    title: "Group B",
                    samples: ["s6", "s7", "s8", "s9"],
                },
            ],
        },
    };
}

describe("buildHierarchyBoxplotData", () => {
    it("builds stats and outliers for nested groups", () => {
        const sampleHierarchy = createSampleHierarchy();

        // Non-obvious setup: subgroup A has a clear high outlier.
        const { statsRows, outlierRows, groupDomain } =
            buildHierarchyBoxplotData(sampleHierarchy, "score");

        expect(groupDomain).toEqual(["Group A / Sub A", "Group B"]);
        expect(statsRows.map((row) => row.group)).toEqual([
            "Group A / Sub A",
            "Group B",
        ]);
        expect(statsRows[0].n).toBe(5);
        expect(statsRows[1].n).toBe(4);

        expect(outlierRows).toEqual([
            {
                sampleId: "s5",
                group: "Group A / Sub A",
                value: 100,
            },
        ]);
    });

    it("fails on unknown attributes", () => {
        const sampleHierarchy = createSampleHierarchy();

        expect(() =>
            buildHierarchyBoxplotData(sampleHierarchy, "missing")
        ).toThrow("Unknown metadata attribute");
    });
});
