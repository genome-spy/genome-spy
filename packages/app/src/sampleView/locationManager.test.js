// @ts-check
import { expect, test, vi } from "vitest";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import {
    computeScrollMetrics,
    getClosestSampleLocationAt,
    getSampleLocationAt,
    LocationManager,
} from "./locationManager.js";

test("one display topology supplies fitted rows, summaries and ancestor bounds", () => {
    const manager = createManager({
        height: 40,
        summaryHeight: 4,
        sampleLayout: { groupSpacing: 2 },
    });
    const { samples, summaries, groups } = manager.getLocations();

    expect(samples.map((row) => row.key)).toEqual(["s1", "s2", "s3"]);
    expect(samples.map((row) => row.locSize)).toEqual([
        { location: 4, size: 10 },
        { location: 14, size: 10 },
        { location: 30, size: 10 },
    ]);
    expect(summaries.map((group) => group.locSize)).toEqual([
        { location: 0, size: 24 },
        { location: 26, size: 14 },
    ]);
    expect(
        groups.map(({ key, locSize }) => [
            key.group.name,
            key.depth,
            key.n,
            locSize,
        ])
    ).toEqual([
        ["Root", 0, 3, { location: 0, size: 40 }],
        ["A", 1, 2, { location: 0, size: 24 }],
        ["B", 1, 1, { location: 26, size: 14 }],
    ]);
    expect(manager.getBandLayout()).toMatchObject({
        sampleIds: ["s1", "s2", "s3"],
        cuts: ["s3"],
        gap: 6,
        inset: 0,
        origin: 4,
    });
    expect(manager.getScrollableHeight()).toBe(128);
});

test("row padding follows configured density without changing logical band steps", () => {
    const manager = createManager({ height: 60, groups: [["s1", "s2"]] });
    expect(manager.getLocations().samples.map((row) => row.locSize)).toEqual([
        { location: 3, size: 24 },
        { location: 33, size: 24 },
    ]);
    expect(manager.getBandLayout().inset).toBe(3);

    const custom = createManager({
        height: 30,
        groups: [["s1"]],
        sampleLayout: { sampleSpacingFactor: 0.4 },
    });
    expect(custom.getLocations().samples[0].locSize).toEqual({
        location: 6,
        size: 18,
    });
});

test("peek retains the selected sample at the pointer and scroll geometry remains live", async () => {
    const manager = createManager({ height: 40, summaryHeight: 4 });
    const locations = manager.getLocations();
    const row = locations.samples[2].locSize;
    await manager.togglePeek(true, 20, "s3");
    expect(manager.getLocations()).toBe(locations);
    expect(locations.samples[2].locSize).toBe(row);
    expect(row.location + row.size / 2).toBeCloseTo(20);
    expect(row.size).toBe(28);
    const revision = manager.getBandLayout().revision;
    manager.setScrollOffset(0);
    expect(row.location).toBeCloseTo(96.5);
    expect(manager.getBandLayout().revision).toBeGreaterThan(revision);
});

test("fixed summaries survive exhausted fitted space and closeup can open from it", async () => {
    const manager = createManager({ height: 10, summaryHeight: 8 });
    expect(
        manager.getLocations().samples.every((row) => row.locSize.size === 0)
    ).toBe(true);
    expect(
        manager.getLocations().summaries.map((group) => group.locSize)
    ).toEqual([
        { location: 0, size: 8 },
        { location: 13, size: 8 },
    ]);
    await manager.togglePeek(true, 5, "s1");
    expect(manager.getLocations().samples[0].locSize.size).toBe(28);
});

test("unavailable layouts retain no background geometry", () => {
    const manager = createManager({ height: 0 });
    expect(manager.getLocations()).toBeUndefined();
    expect(
        manager.getGroupBackgroundRects(Rectangle.create(0, 0, 100, 0))
    ).toEqual([]);
});

test("disposal cancels and settles an active peek transition", async () => {
    /** @type {Set<(timestamp: number) => void>} */
    const frames = new Set();
    const requestRender = vi.fn();
    const manager = createManager({
        height: 20,
        animator: {
            requestTransition: (callback) => frames.add(callback),
            cancelTransition: (callback) => frames.delete(callback),
            requestRender,
        },
    });
    const source = manager.getPlacementSource();
    const finished = manager.togglePeek(true);
    const pendingFrame = frames.values().next().value;
    manager.dispose();
    await finished;
    expect(frames.size).toBe(0);
    expect(() => source.getSnapshot()).toThrow("disposed");
    pendingFrame(performance.now() + 1000);
    expect(manager.getPeekState()).toBe(0);
    expect(requestRender).not.toHaveBeenCalled();
});

test("scroll metrics account for peek progress and sticky summary inset", () => {
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
    expect(
        computeScrollMetrics({
            viewportHeight: 100,
            scrollableHeight: 250,
            scrollOffset: 40,
            peekState: 0,
        }).effectiveScrollOffset
    ).toBe(0);
});

test("exact sample hits exclude padding and end boundaries; focus chooses the nearest row", () => {
    const rows = createManager({
        height: 100,
        groups: [["s1", "s2"]],
    }).getLocations().samples;
    const first = rows[0].locSize;
    expect(getSampleLocationAt(first.location, rows)?.key).toBe("s1");
    expect(
        getSampleLocationAt(first.location + first.size, rows)
    ).toBeUndefined();
    expect(
        getClosestSampleLocationAt(first.location + first.size + 1, rows)?.key
    ).toBe("s1");
    expect(
        getClosestSampleLocationAt(rows[1].locSize.location - 1, rows)?.key
    ).toBe("s2");
});

/**
 * @param {{height: number, summaryHeight?: number, groups?: string[][], sampleLayout?: import("../spec/sampleView.js").SampleLayoutDef,
 * animator?: Pick<import("@genome-spy/core/utils/animator.js").default, "requestTransition" | "cancelTransition" | "requestRender">}} options
 */
function createManager({
    height,
    summaryHeight = 0,
    groups = [["s1", "s2"], ["s3"], []],
    sampleLayout,
    animator,
}) {
    const hierarchy =
        /** @type {import("./state/sampleState.js").SampleHierarchy} */ ({
            rootGroup: {
                name: "Root",
                title: "Root",
                groups: groups.map((samples, index) => ({
                    name: String.fromCharCode(65 + index),
                    title: "Group",
                    samples,
                })),
            },
        });
    return new LocationManager({
        getSampleHierarchy: () => hierarchy,
        getHeight: () => height,
        getSummaryHeight: () => summaryHeight,
        onLocationUpdate: () => {},
        viewContext: /** @type {any} */ ({
            animator: animator ?? {
                requestTransition: (callback) =>
                    callback(performance.now() + 1000),
                cancelTransition: () => {},
                requestRender: () => {},
            },
        }),
        isStickySummaries: () => true,
        sampleLayout,
    });
}
