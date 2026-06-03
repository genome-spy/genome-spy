// @ts-check
import { describe, expect, it } from "vitest";
import {
    createThresholdGroupAccessor,
    formatThresholdInterval,
    retainGroupsByRank,
    retainGroupsBySize,
    groupSamplesByAccessor,
    groupSamplesByQuartiles,
    groupSamplesByThresholds,
    makeCustomGroupAccessor,
    removeGroup,
    ungroup,
} from "./groupOperations.js";

describe("groupOperations", () => {
    it("creates custom group accessors", () => {
        const groups = {
            a: [1, 2],
            b: [3, 4],
        };

        const accessor = makeCustomGroupAccessor((x) => x, groups);

        expect(accessor(1)).toEqual("a");
        expect(accessor(2)).toEqual("a");
        expect(accessor(3)).toEqual("b");
        expect(accessor(4)).toEqual("b");
    });

    it("groups samples with explicit group order and titles", () => {
        const sampleGroup = {
            name: "root",
            title: "Root",
            samples: ["s1", "s2", "s3", "s4"],
        };

        const accessor = (sample) =>
            sample == "s1" || sample == "s2" ? "A" : "B";

        groupSamplesByAccessor(sampleGroup, accessor, ["B", "A"], ["B!", "A!"]);

        expect(sampleGroup.groups).toHaveLength(2);
        expect(sampleGroup.groups[0]).toEqual({
            name: "B",
            title: "B!",
            samples: ["s3", "s4"],
        });
        expect(sampleGroup.groups[1]).toEqual({
            name: "A",
            title: "A!",
            samples: ["s1", "s2"],
        });
        expect(sampleGroup.samples).toBeUndefined();
    });

    it("groups samples by thresholds", () => {
        const sampleGroup = {
            name: "root",
            title: "Root",
            samples: ["1", "2", "3", "4"],
        };

        groupSamplesByThresholds(sampleGroup, (value) => Number(value), [
            { operator: "lt", operand: 2 },
            { operator: "lt", operand: 4 },
        ]);

        expect(sampleGroup.groups).toHaveLength(3);
        // Threshold groups are ordered from highest to lowest by design.
        expect(sampleGroup.groups[0].samples).toEqual(["4"]);
        expect(sampleGroup.groups[1].samples).toEqual(["2", "3"]);
        expect(sampleGroup.groups[2].samples).toEqual(["1"]);
    });

    it("keeps threshold group titles aligned when a group is empty", () => {
        const sampleGroup = {
            name: "root",
            title: "Root",
            samples: ["1", "3"],
        };

        groupSamplesByThresholds(sampleGroup, (value) => Number(value), [
            { operator: "lt", operand: 2 },
            { operator: "lt", operand: 4 },
        ]);

        // The highest interval is empty, so later titles must not shift upward.
        expect(sampleGroup.groups.map((group) => group.name)).toEqual([
            "Group 2",
            "Group 1",
        ]);
        expect(sampleGroup.groups.map((group) => group.title)).toEqual([
            formatThresholdInterval(
                { operator: "lt", operand: 2 },
                { operator: "lt", operand: 4 }
            ),
            formatThresholdInterval(
                { operator: "lt", operand: -Infinity },
                { operator: "lt", operand: 2 }
            ),
        ]);
    });

    it("uses custom threshold group titles while preserving interval titles", () => {
        const sampleGroup = {
            name: "root",
            title: "Root",
            samples: ["1", "2", "3", "4"],
        };

        groupSamplesByThresholds(
            sampleGroup,
            (value) => Number(value),
            [
                { operator: "lt", operand: 2 },
                { operator: "lt", operand: 4 },
            ],
            ["Low", "Medium", "High"]
        );

        expect(sampleGroup.groups.map((group) => group.name)).toEqual([
            "Group 3",
            "Group 2",
            "Group 1",
        ]);
        expect(sampleGroup.groups.map((group) => group.title)).toEqual([
            "High",
            "Medium",
            "Low",
        ]);
        expect(sampleGroup.groups.map((group) => group.generatedTitle)).toEqual(
            [
                formatThresholdInterval(
                    { operator: "lt", operand: 4 },
                    { operator: "lte", operand: Infinity }
                ),
                formatThresholdInterval(
                    { operator: "lt", operand: 2 },
                    { operator: "lt", operand: 4 }
                ),
                formatThresholdInterval(
                    { operator: "lt", operand: -Infinity },
                    { operator: "lt", operand: 2 }
                ),
            ]
        );
    });

    it("rejects threshold group titles with the wrong count", () => {
        const sampleGroup = {
            name: "root",
            title: "Root",
            samples: ["1", "2"],
        };

        expect(() =>
            groupSamplesByThresholds(
                sampleGroup,
                (value) => Number(value),
                [{ operator: "lt", operand: 2 }],
                ["Low"]
            )
        ).toThrow("Expected 2 threshold group titles, got 1.");
    });

    it("rejects duplicate threshold group titles", () => {
        const sampleGroup = {
            name: "root",
            title: "Root",
            samples: ["1", "2"],
        };

        expect(() =>
            groupSamplesByThresholds(
                sampleGroup,
                (value) => Number(value),
                [{ operator: "lt", operand: 2 }],
                ["Low", " Low "]
            )
        ).toThrow('Duplicate threshold group title: "Low".');
    });

    it("handles quartile grouping when all values are equal", () => {
        const sampleGroup = {
            name: "root",
            title: "Root",
            samples: ["2", "2", "2"],
        };

        // All values equal should collapse into a single group.
        groupSamplesByQuartiles(sampleGroup, (value) => Number(value));

        expect(sampleGroup.groups).toHaveLength(1);
        expect(sampleGroup.groups[0].samples).toEqual(["2", "2", "2"]);
    });

    it("creates a threshold accessor with lt and lte semantics", () => {
        const accessor = createThresholdGroupAccessor(
            (datum) => datum.value,
            [
                { operator: "lt", operand: 2 },
                { operator: "lte", operand: 4 },
            ]
        );

        expect(accessor({ value: 1 })).toBe(0);
        expect(accessor({ value: 2 })).toBe(1);
        expect(accessor({ value: 4 })).toBe(1);
        expect(accessor({ value: 5 })).toBe(2);
        expect(accessor({ value: "x" })).toBeUndefined();
    });

    it("formats threshold intervals with bounds", () => {
        const formatted = formatThresholdInterval(
            { operator: "lt", operand: 1 },
            { operator: "lte", operand: 2 }
        );

        expect(formatted).toBe("[1, 2]");
    });

    it("removes groups by path", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "A",
                    title: "A",
                    samples: ["s1"],
                },
                {
                    name: "B",
                    title: "B",
                    groups: [
                        { name: "B1", title: "B1", samples: ["s2"] },
                        { name: "B2", title: "B2", samples: ["s3"] },
                    ],
                },
            ],
        };

        removeGroup(root, ["B", "B1"]);
        expect(root.groups[1].groups.map((group) => group.name)).toEqual([
            "B2",
        ]);
    });

    it("fails when removing a missing group", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [{ name: "A", title: "A", samples: ["s1"] }],
        };

        expect(() => removeGroup(root, ["B"])).toThrow(
            "Sample group path not found: B"
        );
    });

    it("fails when removing the root group", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [{ name: "A", title: "A", samples: ["s1"] }],
        };

        expect(() => removeGroup(root, [])).toThrow(
            "Cannot remove the root sample group."
        );
    });

    it("fails when a group path continues through a sample group", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [{ name: "A", title: "A", samples: ["s1"] }],
        };

        expect(() => removeGroup(root, ["A", "B"])).toThrow(
            "Sample group path does not refer to a nested group: A / B"
        );
    });

    it("retains ranked groups at the top level", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [
                { name: "A", title: "A", samples: ["s1", "s2"] },
                { name: "B", title: "B", samples: ["s3"] },
                { name: "C", title: "C", samples: ["s4", "s5", "s6"] },
            ],
        };

        retainGroupsByRank(root, 0, "size", 2, "descending");

        expect(root.groups.map((group) => group.name)).toEqual(["A", "C"]);
    });

    it("retains ranked groups separately within each ancestor partition", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "A",
                    title: "A",
                    groups: [
                        { name: "A1", title: "A1", samples: ["s1"] },
                        {
                            name: "A2",
                            title: "A2",
                            samples: ["s2", "s3", "s4"],
                        },
                    ],
                },
                {
                    name: "B",
                    title: "B",
                    groups: [
                        {
                            name: "B1",
                            title: "B1",
                            samples: ["s5", "s6"],
                        },
                        { name: "B2", title: "B2", samples: ["s7"] },
                    ],
                },
            ],
        };

        retainGroupsByRank(root, 1, "size", 1, "descending");

        expect(root.groups[0].groups.map((group) => group.name)).toEqual([
            "A2",
        ]);
        expect(root.groups[1].groups.map((group) => group.name)).toEqual([
            "B1",
        ]);
    });

    it("retains ascending-ranked groups and preserves current order on ties", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [
                { name: "A", title: "A", samples: ["s1", "s2"] },
                { name: "B", title: "B", samples: ["s3"] },
                { name: "C", title: "C", samples: ["s4"] },
            ],
        };

        retainGroupsByRank(root, 0, "size", 2, "ascending");

        expect(root.groups.map((group) => group.name)).toEqual(["B", "C"]);
    });

    it("retains groups by size threshold at nested levels", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "A",
                    title: "A",
                    groups: [
                        { name: "A1", title: "A1", samples: ["s1"] },
                        {
                            name: "A2",
                            title: "A2",
                            samples: ["s2", "s3"],
                        },
                    ],
                },
                {
                    name: "B",
                    title: "B",
                    groups: [
                        {
                            name: "B1",
                            title: "B1",
                            samples: ["s4", "s5", "s6"],
                        },
                        { name: "B2", title: "B2", samples: ["s7"] },
                    ],
                },
            ],
        };

        retainGroupsBySize(root, 1, "size", "gte", 2);

        expect(root.groups[0].groups.map((group) => group.name)).toEqual([
            "A2",
        ]);
        expect(root.groups[1].groups.map((group) => group.name)).toEqual([
            "B1",
        ]);
    });

    it("ungroups the top level into the current root samples", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [
                { name: "A", title: "A", samples: ["s1", "s2"] },
                {
                    name: "C",
                    title: "C",
                    groups: [
                        { name: "C1", title: "C1", samples: ["s4"] },
                        { name: "C2", title: "C2", samples: ["s5", "s6"] },
                    ],
                },
            ],
        };

        ungroup(root, 0);

        expect(root).toEqual({
            name: "ROOT",
            title: "Root",
            samples: ["s1", "s2", "s4", "s5", "s6"],
        });
    });

    it("ungroups nested levels while preserving ancestor groups", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "A",
                    title: "A",
                    groups: [
                        { name: "A1", title: "A1", samples: ["s1"] },
                        {
                            name: "A2",
                            title: "A2",
                            samples: ["s2", "s3"],
                        },
                    ],
                },
                {
                    name: "B",
                    title: "B",
                    groups: [
                        {
                            name: "B1",
                            title: "B1",
                            groups: [
                                { name: "B1a", title: "B1a", samples: ["s4"] },
                            ],
                        },
                    ],
                },
            ],
        };

        ungroup(root, 1);

        expect(root.groups).toEqual([
            { name: "A", title: "A", samples: ["s1", "s2", "s3"] },
            { name: "B", title: "B", samples: ["s4"] },
        ]);
    });

    it("fails when retaining groups at a missing level", () => {
        const root = {
            name: "ROOT",
            title: "Root",
            groups: [{ name: "A", title: "A", samples: ["s1"] }],
        };

        expect(() =>
            retainGroupsByRank(root, 1, "size", 1, "descending")
        ).toThrow("Grouping level not found: 1");
    });
});
