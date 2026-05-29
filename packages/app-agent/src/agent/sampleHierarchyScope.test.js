import { describe, expect, it } from "vitest";
import { collectVisibleSampleIds } from "./sampleHierarchyScope.js";

describe("sampleHierarchyScope", () => {
    it("collects distinct visible sample ids from nested groups", () => {
        const rootGroup = {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "A",
                    title: "A",
                    samples: ["sample1", "sample2"],
                },
                {
                    name: "B",
                    title: "B",
                    groups: [
                        {
                            name: "B1",
                            title: "B1",
                            samples: ["sample2", "sample3"],
                        },
                    ],
                },
            ],
        };

        expect(collectVisibleSampleIds(rootGroup)).toEqual([
            "sample1",
            "sample2",
            "sample3",
        ]);
    });

    it("returns an empty sample scope when the hierarchy is unavailable", () => {
        expect(collectVisibleSampleIds(undefined)).toEqual([]);
    });
});
