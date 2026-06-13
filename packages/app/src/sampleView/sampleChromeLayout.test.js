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
        const layout = new SampleChromeLayout({
            specYAxis: { mode: "middle", minSampleHeight: 50 },
            getAxes: () => ({
                left: createAxisView(30, 2),
                right: createAxisView(40, 4),
            }),
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

    test("does not reserve lanes below the minimum sample height", () => {
        const axes = {
            left: createAxisView(30, 2),
        };
        const locations = createLocations(49);
        const shortSamples = new SampleChromeLayout({
            specYAxis: { mode: "middle", minSampleHeight: 50 },
            getAxes: () => axes,
            getPeekState: () => 0,
        });

        expect(shortSamples.getLeftReserve(locations)).toBe(0);
    });

    test("keeps lane reservation but suppresses rendering during peek", () => {
        const axisView = createAxisView(30, 2);
        const locations = createLocations(60);
        const peek = new SampleChromeLayout({
            specYAxis: { mode: "middle", minSampleHeight: 50 },
            getAxes: () => ({ left: axisView }),
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
            specYAxis: { mode: "all", minSampleHeight: 50 },
            getAxes: () => ({ left: axisView }),
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
            specYAxis: { mode: "middle", minSampleHeight: 1 },
            getAxes: () => ({ left: axisView }),
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

    test("ignores hidden axis candidates and uses the visible candidate", () => {
        const hiddenAxis = createAxisView(20, 2);
        const visibleAxis = createAxisView(30, 4);
        const layout = new SampleChromeLayout({
            specYAxis: { mode: "middle", minSampleHeight: 1 },
            getAxisCandidates: () => ({
                left: [
                    createCandidate(hiddenAxis, false),
                    createCandidate(visibleAxis, true),
                ],
            }),
            getPeekState: () => 0,
        });
        const locations = createLocations(60);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(34);
        expect(hiddenAxis.render).not.toHaveBeenCalled();
        expect(visibleAxis.render).toHaveBeenCalledTimes(1);
    });

    test("uses the last visible candidate when multiple candidates are visible", () => {
        const firstAxis = createAxisView(20, 2);
        const lastAxis = createAxisView(30, 4);
        const layout = new SampleChromeLayout({
            specYAxis: { mode: "middle", minSampleHeight: 1 },
            getAxisCandidates: () => ({
                left: [
                    createCandidate(firstAxis, true),
                    createCandidate(lastAxis, true),
                ],
            }),
            getPeekState: () => 0,
        });
        const locations = createLocations(60);

        layout.renderVerticalAxes(
            /** @type {any} */ ({}),
            Rectangle.create(50, 100, 200, 120),
            locations
        );

        expect(layout.getLeftReserve(locations)).toBe(34);
        expect(firstAxis.render).not.toHaveBeenCalled();
        expect(lastAxis.render).toHaveBeenCalledTimes(1);
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
 */
function createAxisView(size, offset) {
    return /** @type {any} */ ({
        axisProps: { offset },
        getPerpendicularSize: () => size,
        render: vi.fn(),
    });
}

/**
 * @param {any} axisView
 * @param {boolean} visible
 */
function createCandidate(axisView, visible) {
    return {
        axisView,
        sourceView: {
            isConfiguredVisible: () => visible,
        },
    };
}
