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
});
