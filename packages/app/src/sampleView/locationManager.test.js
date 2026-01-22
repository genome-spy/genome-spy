import { describe, expect, test } from "vitest";
import {
    calculateLocations,
    computeScrollMetrics,
    getSampleLocationAt,
} from "./locationManager.js";

describe("LocationManager layout helpers", () => {
    test("calculateLocations respects fixed sample height without padding", () => {
        // Build a minimal flattened hierarchy to control group/sample layout.
        /** @type {import("./state/sampleState.js").GroupGroup} */
        const root = {
            name: "Root",
            title: "Root",
            groups: [],
        };

        /** @type {import("./state/sampleState.js").SampleGroup} */
        const groupA = {
            name: "A",
            title: "Group A",
            samples: ["s1", "s2"],
        };

        /** @type {import("./state/sampleState.js").SampleGroup} */
        const groupB = {
            name: "B",
            title: "Group B",
            samples: ["s3"],
        };

        root.groups = [groupA, groupB];

        const flattenedHierarchy = [
            [root, groupA],
            [root, groupB],
        ];

        const summaryHeight = 4;
        const groupSpacing = 2;

        const { samples, summaries, groups } = calculateLocations(
            flattenedHierarchy,
            {
                sampleHeight: 10,
                groupSpacing,
                summaryHeight,
            }
        );

        expect(summaries).toHaveLength(2);
        expect(samples).toHaveLength(3);
        expect(groups).toHaveLength(3);

        const summaryByName = new Map(
            summaries.map((summary) => [summary.key.at(-1).name, summary])
        );

        expect(summaryByName.get("A").locSize.size).toBe(24);
        expect(summaryByName.get("B").locSize.size).toBe(14);

        expect(summaryByName.get("A").locSize.location).toBe(0);
        expect(summaryByName.get("B").locSize.location).toBe(26);

        const sampleByKey = new Map(
            samples.map((sample) => [sample.key, sample])
        );

        expect(sampleByKey.get("s1").locSize.location).toBe(4);
        expect(sampleByKey.get("s2").locSize.location).toBe(14);
        expect(sampleByKey.get("s3").locSize.location).toBe(30);

        for (const sample of samples) {
            expect(sample.locSize.size).toBe(10);
        }

        const groupByName = new Map(
            groups.map((group) => [group.key.group.name, group])
        );

        expect(groupByName.get("Root").key.n).toBe(3);
        expect(groupByName.get("A").key.n).toBe(2);
        expect(groupByName.get("B").key.n).toBe(1);
    });

    test("calculateLocations fills available height in fitted mode", () => {
        // Use view height to verify grow-based layout fills the viewport.
        /** @type {import("./state/sampleState.js").GroupGroup} */
        const root = {
            name: "Root",
            title: "Root",
            groups: [],
        };

        /** @type {import("./state/sampleState.js").SampleGroup} */
        const groupA = {
            name: "A",
            title: "Group A",
            samples: ["s1", "s2"],
        };

        /** @type {import("./state/sampleState.js").SampleGroup} */
        const groupB = {
            name: "B",
            title: "Group B",
            samples: ["s3"],
        };

        root.groups = [groupA, groupB];

        const flattenedHierarchy = [
            [root, groupA],
            [root, groupB],
        ];

        const viewHeight = 100;
        const summaryHeight = 4;
        const groupSpacing = 2;

        const { samples, summaries } = calculateLocations(flattenedHierarchy, {
            viewHeight,
            groupSpacing,
            summaryHeight,
        });

        const totalSummarySize = summaries.reduce(
            (sum, summary) => sum + summary.locSize.size,
            0
        );
        const totalSpacing = groupSpacing * (summaries.length - 1);

        expect(totalSummarySize + totalSpacing).toBeCloseTo(viewHeight);

        const summaryByName = new Map(
            summaries.map((summary) => [summary.key.at(-1).name, summary])
        );

        const samplesByKey = new Map(
            samples.map((sample) => [sample.key, sample])
        );

        const groupALoc = summaryByName.get("A").locSize;
        const groupAStart = groupALoc.location + summaryHeight;
        const groupAEnd = groupALoc.location + groupALoc.size;
        const s1Loc = samplesByKey.get("s1").locSize;
        const s2Loc = samplesByKey.get("s2").locSize;

        expect(s1Loc.location).toBeGreaterThanOrEqual(groupAStart);
        expect(s2Loc.location + s2Loc.size).toBeLessThanOrEqual(groupAEnd);
        expect(s1Loc.location + s1Loc.size).toBeLessThanOrEqual(s2Loc.location);

        const groupBSummary = summaryByName.get("B").locSize;
        const groupBStart = groupBSummary.location + summaryHeight;
        const groupBEnd = groupBSummary.location + groupBSummary.size;
        const s3Loc = samplesByKey.get("s3").locSize;

        expect(s3Loc.location).toBeGreaterThanOrEqual(groupBStart);
        expect(s3Loc.location + s3Loc.size).toBeLessThanOrEqual(groupBEnd);

        const groupASum = s1Loc.size + s2Loc.size;
        const groupBSum = s3Loc.size;

        expect(groupASum).toBeLessThan(groupALoc.size - summaryHeight);
        expect(groupBSum).toBeLessThan(groupBSummary.size - summaryHeight);
    });

    test("computeScrollMetrics interpolates scroll offset", () => {
        const metrics = computeScrollMetrics({
            viewportHeight: 100,
            summaryHeight: 10,
            scrollableHeight: 250,
            scrollOffset: 40,
            peekState: 0.5,
        });

        expect(metrics.effectiveViewportHeight).toBe(90);
        expect(metrics.contentHeight).toBe(170);
        expect(metrics.effectiveScrollOffset).toBe(20);
    });

    test("getSampleLocationAt returns the enclosing sample", () => {
        // Keep sampleHeight below padding threshold to avoid size adjustments.
        /** @type {import("./state/sampleState.js").GroupGroup} */
        const root = {
            name: "Root",
            title: "Root",
            groups: [],
        };

        /** @type {import("./state/sampleState.js").SampleGroup} */
        const groupA = {
            name: "A",
            title: "Group A",
            samples: ["s1", "s2"],
        };

        root.groups = [groupA];

        const { samples } = calculateLocations([[root, groupA]], {
            sampleHeight: 10,
            summaryHeight: 4,
        });

        expect(getSampleLocationAt(4, samples).key).toBe("s1");
        expect(getSampleLocationAt(13, samples).key).toBe("s1");
        expect(getSampleLocationAt(14, samples).key).toBe("s2");
    });
});
