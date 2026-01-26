import { describe, expect, it } from "vitest";
import { buildHierarchyBoxplotData } from "./hierarchyBoxplotData.js";
import { createDefaultValuesProvider } from "../sampleView/attributeValues.js";

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
        const attributeInfo = {
            name: "score",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "score" },
            accessor: (sampleId, hierarchy) =>
                hierarchy.sampleMetadata.entities[sampleId]?.score,
            valuesProvider: createDefaultValuesProvider(
                (sampleId, hierarchy) =>
                    hierarchy.sampleMetadata.entities[sampleId]?.score
            ),
            type: "quantitative",
        };

        // Non-obvious setup: subgroup A has a clear high outlier.
        const { statsRows, outlierRows, groupDomain } =
            buildHierarchyBoxplotData(sampleHierarchy, attributeInfo);

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
        const attributeInfo = {
            name: "missing",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "missing" },
            accessor: (sampleId, hierarchy) =>
                hierarchy.sampleMetadata.entities[sampleId]?.missing,
            valuesProvider: createDefaultValuesProvider(
                (sampleId, hierarchy) =>
                    hierarchy.sampleMetadata.entities[sampleId]?.missing
            ),
            type: "quantitative",
        };

        expect(() =>
            buildHierarchyBoxplotData(sampleHierarchy, attributeInfo)
        ).toThrow("Unknown metadata attribute");
    });

    it("skips groups with no valid values", () => {
        const sampleHierarchy = createSampleHierarchy();
        const attributeInfo = {
            name: "score",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "score" },
            accessor: () => undefined,
            valuesProvider: ({ sampleIds }) =>
                sampleIds.map((sampleId) =>
                    ["s1", "s2", "s3", "s4", "s5"].includes(sampleId)
                        ? Number.NaN
                        : Number(sampleId.slice(1))
                ),
            type: "quantitative",
        };

        // Non-obvious setup: first group values are all invalid.
        const { statsRows, outlierRows, groupDomain } =
            buildHierarchyBoxplotData(sampleHierarchy, attributeInfo);

        expect(groupDomain).toEqual(["Group B"]);
        expect(statsRows).toHaveLength(1);
        expect(outlierRows).toEqual([]);
    });

    it("uses interval aggregation scope for values", () => {
        const sampleHierarchy = createSampleHierarchy();
        const attributeInfo = {
            name: "mean(score)",
            attribute: {
                type: "VIEW_ATTRIBUTE",
                specifier: {
                    view: "view",
                    field: "score",
                    interval: [0, 1],
                    aggregation: { op: "mean" },
                },
            },
            accessor: () => undefined,
            valuesProvider: ({ sampleIds, interval, aggregation }) =>
                sampleIds.map(() =>
                    interval && aggregation ? 100 : Number.NaN
                ),
            type: "quantitative",
        };

        // Non-obvious setup: values provider only yields finite values when scoped.
        const { statsRows } = buildHierarchyBoxplotData(
            sampleHierarchy,
            attributeInfo
        );

        expect(statsRows[0].min).toBe(100);
        expect(statsRows[0].max).toBe(100);
    });

    it("rejects non-quantitative attributes", () => {
        const sampleHierarchy = createSampleHierarchy();
        const attributeInfo = {
            name: "status",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "status" },
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
        };

        expect(() =>
            buildHierarchyBoxplotData(sampleHierarchy, attributeInfo)
        ).toThrow("Boxplot requires a quantitative attribute.");
    });
});
