// @ts-check
import { describe, expect, test } from "vitest";
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
            layout.renderVerticalAxes(context, plotCoords)
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

    test("does not reserve lanes below the minimum sample height or during peek", () => {
        const axes = {
            left: createAxisView(30, 2),
        };
        const locations = createLocations(49);
        const shortSamples = new SampleChromeLayout({
            specYAxis: { mode: "middle", minSampleHeight: 50 },
            getAxes: () => axes,
            getPeekState: () => 0,
        });
        const peek = new SampleChromeLayout({
            specYAxis: { mode: "middle", minSampleHeight: 50 },
            getAxes: () => axes,
            getPeekState: () => 0.5,
        });

        expect(shortSamples.getLeftReserve(locations)).toBe(0);
        expect(peek.getLeftReserve(createLocations(60))).toBe(0);
    });
});

/**
 * @param {number} sampleHeight
 * @returns {import("./sampleViewTypes.js").Locations}
 */
function createLocations(sampleHeight) {
    return {
        groups: [],
        samples: [{ key: "A", locSize: { location: 0, size: sampleHeight } }],
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
    });
}
