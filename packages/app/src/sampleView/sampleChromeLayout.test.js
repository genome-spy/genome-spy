// @ts-check
import { describe, expect, test, vi } from "vitest";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import SampleChromeLayout from "./sampleChromeLayout.js";

describe("SampleChromeLayout", () => {
    test("starts as a no-op chrome layout", () => {
        const layout = new SampleChromeLayout();
        const plotCoords = Rectangle.create(10, 20, 300, 120);
        const context = {};

        expect(layout.getLeftReserve()).toBe(0);
        expect(layout.getRightReserve()).toBe(0);
        expect(layout.getPlotCoords(plotCoords)).toBe(plotCoords);

        expect(() =>
            layout.renderVerticalAxes(/** @type {any} */ (context), plotCoords)
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

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(0);
        expect(layout.getPlotCoords(plotCoords, locations)).toBe(plotCoords);
        expect(axisView.render).toHaveBeenCalledTimes(1);
        expect(axisView.render.mock.calls[0][1].x).toBe(12);
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

        peek.renderVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(axisView.render).not.toHaveBeenCalled();
    });

    test("renders an axis for every eligible sample in all mode", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "all", minSampleHeight: 50 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(50, 100, 200, 120);
        const locations = createLocations([60, 40, 70]);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(axisView.render).toHaveBeenCalledTimes(2);
        expect(axisView.render.mock.calls[0][1].x).toBe(38);
        expect(axisView.render.mock.calls[0][1].y).toBe(100);
        expect(axisView.render.mock.calls[0][1].height).toBe(60);
        expect(axisView.render.mock.calls[1][1].y).toBe(200);
        expect(axisView.render.mock.calls[1][1].height).toBe(70);
    });

    test("renders the midpoint sample in middle mode", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 1 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(50, 100, 200, 120);
        const locations = createLocations([30, 30, 30]);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(axisView.render).toHaveBeenCalledTimes(1);
        expect(axisView.render.mock.calls[0][1].y).toBe(130);
        expect(axisView.render.mock.calls[0][1].height).toBe(30);
    });

    test("prefers the upper middle sample in middle mode near-ties", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 1 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const plotCoords = Rectangle.create(50, 100, 200, 120);
        const locations = createLocations([25, 25, 24.999999998, 25.000000002]);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            plotCoords,
            locations
        );

        expect(axisView.render).toHaveBeenCalledTimes(1);
        expect(axisView.render.mock.calls[0][1].y).toBe(125);
        expect(axisView.render.mock.calls[0][1].height).toBe(25);
    });

    test("uses the active axis candidate", () => {
        const axisView = createAxisView(30, 4);
        const layout = new SampleChromeLayout({
            sampleYAxis: { mode: "middle", minSampleHeight: 1 },
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const locations = createLocations(60);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(34);
        expect(axisView.render).toHaveBeenCalledTimes(1);
    });

    test("uses all mode and default min sample height by default", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const locations = createLocations([60, 59, 61]);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(12);
        expect(axisView.render).toHaveBeenCalledTimes(2);
    });

    test("does not reserve or render when sampleYAxis is null", () => {
        const axisView = createAxisView(10, 2);
        const layout = new SampleChromeLayout({
            sampleYAxis: null,
            getActiveAxisCandidate: leftCandidate(axisView),
            getPeekState: () => 0,
        });
        const locations = createLocations(60);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(0);
        expect(axisView.render).not.toHaveBeenCalled();
    });
});

/**
 * @param {number | number[]} sampleHeights
 * @returns {import("./sampleViewTypes.js").Locations}
 */
function createLocations(sampleHeights) {
    const heights = Array.isArray(sampleHeights)
        ? sampleHeights
        : [sampleHeights];
    let location = 0;

    return {
        groups: [],
        samples: heights.map((size, index) => {
            const sample = {
                key: String.fromCharCode("A".charCodeAt(0) + index),
                locSize: { location, size },
            };
            location += size;
            return sample;
        }),
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
        render: vi.fn(),
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
