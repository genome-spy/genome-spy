// @ts-check
import { describe, expect, test, vi } from "vitest";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import SampleChromeLayout from "./sampleChromeLayout.js";
import { LocationManager } from "./locationManager.js";

describe("SampleChromeLayout", () => {
    test("starts as a no-op chrome layout", () => {
        const layout = new SampleChromeLayout();
        const plotCoords = Rectangle.create(10, 20, 300, 120);
        const context = {};

        expect(layout.getLeftReserve()).toBe(0);
        expect(layout.getRightReserve()).toBe(0);
        expect(layout.getPlotCoords(plotCoords)).toBe(plotCoords);

        expect(() =>
            layout.arrangeVerticalAxes(/** @type {any} */ (context), plotCoords)
        ).not.toThrow();
    });

    test("reserves left and right lanes for eligible samples", () => {
        const leftAxis = createAxisView(30, 2);
        const rightAxis = createAxisView(40, 4);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 50 },
            getActiveAxisCandidate: (orient) =>
                createCandidate(orient === "left" ? leftAxis : rightAxis),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(10, 20, 300, 120);
        const locations = createLocations(60);

        const adjusted = layout.getPlotCoords(plotCoords, locations);

        expect(layout.getLeftReserve(locations)).toBe(32);
        expect(layout.getRightReserve(locations)).toBe(44);
        expect(adjusted.x).toBe(42);
        expect(adjusted.width).toBe(224);
    });

    test("renders inside axes without reserving horizontal lanes", () => {
        const axisView = createAxisView(30, 2, "inside");
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 50 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(10, 20, 300, 120);
        const locations = createLocations(60);

        layout.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(0);
        expect(layout.getPlotCoords(plotCoords, locations)).toBe(plotCoords);
        expect(axisView.arrange).toHaveBeenCalledTimes(1);
        expect(axisView.arrange.mock.calls[0][1].x).toBe(12);
    });

    test("does not reserve lanes below the minimum sample height", () => {
        const axisView = createAxisView(30, 2);
        const locations = createLocations(49);
        const shortSamples = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 50 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });

        expect(shortSamples.getLeftReserve(locations)).toBe(0);
        expect(shortSamples.getLeftReserve(createLocations(60, 0))).toBe(0);
    });

    test("keeps lane reservation but suppresses rendering during peek", () => {
        const axisView = createAxisView(30, 2);
        const locations = createLocations(60);
        const peek = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 50 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0.5,
        });

        expect(peek.getLeftReserve(locations)).toBe(32);

        peek.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(axisView.arrange).not.toHaveBeenCalled();
    });

    test("keeps a dense overview's reserve while custom closeup rows cross the axis threshold", async () => {
        const requestTransition = vi.fn();
        const hierarchy =
            /** @type {import("./state/sampleState.js").SampleHierarchy} */ ({
                rootGroup: {
                    name: "Root",
                    title: "Root",
                    samples: Array.from({ length: 10 }, (_, i) => "s" + i),
                },
            });
        const manager = new LocationManager({
            getSampleHierarchy: () => hierarchy,
            getHeight: () => 300,
            getSummaryHeight: () => 0,
            onLocationUpdate: () => {},
            viewContext: /** @type {any} */ ({
                animator: { requestTransition, requestRender: () => {} },
            }),
            isStickySummaries: () => false,
            sampleLayout: { sampleHeight: 100 },
        });
        const layout = new SampleChromeLayout({
            getActiveAxisCandidate: leftCandidate(createAxisView(30, 2)),
            getPeekState: () => manager.getPeekState(),
            getOverviewSampleHeight: () => manager.getOverviewSampleHeight(),
        });
        const locations = manager.getLocations();
        expect(manager.getOverviewSampleHeight()).toBe(24);
        expect(layout.getLeftReserve(locations)).toBe(0);

        // Advance the real peek trajectory through tall intermediate rows.
        const opened = manager.togglePeek(true, 150, "s5");
        requestTransition.mock.lastCall[0](performance.now() + 250);
        expect(manager.getPeekState()).toBeGreaterThan(0);
        expect(manager.getPeekState()).toBeLessThan(1);
        expect(locations.samples[0].locSize.size).toBeGreaterThan(60);
        expect(layout.getLeftReserve(locations)).toBe(0);

        requestTransition.mock.lastCall[0](performance.now() + 1000);
        await opened;
        expect(locations.samples[0].locSize.size).toBe(80);
        expect(layout.getLeftReserve(locations)).toBe(0);
        manager.dispose();
    });

    test("renders an axis for every eligible sample in all mode", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "all", minSampleHeight: 50 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(50, 100, 200, 120);
        const locations = createLocations(60, 3);

        layout.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(axisView.arrange).toHaveBeenCalledTimes(3);
        expect(axisView.arrange.mock.calls[0][1].x).toBe(38);
        expect(axisView.arrange.mock.calls[0][1].y).toBe(100);
        expect(axisView.arrange.mock.calls[0][1].height).toBe(60);
        expect(axisView.arrange.mock.calls[2][1].y).toBe(220);
        expect(axisView.arrange.mock.calls[2][1].height).toBe(60);
    });

    test("selects the physical midpoint across uneven group gaps", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 1 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(50, 100, 200, 120);
        const locations = createLocations(30, 5);
        locations.samples[4].locSize.location = 200;

        layout.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(axisView.arrange).toHaveBeenCalledTimes(1);
        expect(axisView.arrange.mock.calls[0][1].y).toBe(190);
        expect(axisView.arrange.mock.calls[0][1].height).toBe(30);
    });

    test.each(/** @type {const} */ (["top", "bottom"]))(
        "selects the %s of the complete display population",
        (mode) => {
            const axisView = createAxisView(10, 2);
            const layout = new SampleChromeLayout({
                sampleYAxis: { mode, minSampleHeight: 1 },
                getActiveAxisCandidate: leftCandidate(axisView),
            });

            layout.arrangeVerticalAxes(
                /** @type {any} */ ({}),
                Rectangle.create(50, 100, 200, 120),
                createLocations(60, 3)
            );

            expect(axisView.arrange).toHaveBeenCalledTimes(1);
            expect(axisView.arrange.mock.calls[0][1].y).toBe(
                mode === "top" ? 100 : 220
            );
        }
    );

    test("prefers the upper middle sample in middle mode near-ties", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 1 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(50, 100, 200, 120);
        const locations = createLocations(25, 4);
        locations.samples[3].locSize.location += 2e-9;

        layout.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(axisView.arrange).toHaveBeenCalledTimes(1);
        expect(axisView.arrange.mock.calls[0][1].y).toBe(125);
        expect(axisView.arrange.mock.calls[0][1].height).toBe(25);
    });

    test("uses the active axis candidate", () => {
        const axisView = createAxisView(30, 4);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 1 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const locations = createLocations(60);

        layout.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(34);
        expect(axisView.arrange).toHaveBeenCalledTimes(1);
    });

    test("uses all mode and default min sample height by default", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const locations = createLocations(60, 2);

        layout.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(12);
        expect(axisView.arrange).toHaveBeenCalledTimes(2);
    });

    test("does not reserve or render when sampleYAxis is null", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: null,
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const locations = createLocations(60);

        layout.arrangeVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(0);
        expect(axisView.arrange).not.toHaveBeenCalled();
    });
});

/**
 * @param {number} sampleHeight
 * @param {number} [count]
 * @returns {import("./sampleViewTypes.js").Locations}
 */
function createLocations(sampleHeight, count = 1) {
    return {
        groups: [],
        samples: Array.from({ length: count }, (_, index) => ({
            key: String.fromCharCode("A".charCodeAt(0) + index),
            locSize: { location: index * sampleHeight, size: sampleHeight },
        })),
        summaries: [],
    };
}

/**
 * @param {number} size
 * @param {number} offset
 * @param {import("@genome-spy/core/spec/axis.js").AxisPlacement} [placement]
 */
function createAxisView(size, offset, placement) {
    return /** @type {any} */ ({
        axisProps: { offset, placement },
        getPerpendicularSize: () => size,
        arrange: vi.fn(),
    });
}

/**
 * @param {any} axisView
 */
function leftCandidate(axisView) {
    return (/** @type {"left" | "right"} */ orient) =>
        orient === "left" ? createCandidate(axisView) : undefined;
}

/**
 * @param {any} axisView
 */
function createCandidate(axisView) {
    return {
        axisView,
    };
}
