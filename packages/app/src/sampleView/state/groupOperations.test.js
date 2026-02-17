// @ts-check
import { describe, expect, it } from "vitest";
import {
    createThresholdGroupAccessor,
    formatThresholdInterval,
    groupSamplesByAccessor,
    groupSamplesByQuartiles,
    groupSamplesByThresholds,
    makeCustomGroupAccessor,
    removeGroup,
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
});
