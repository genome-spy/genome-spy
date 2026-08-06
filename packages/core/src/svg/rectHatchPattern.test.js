// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createRectHatchPattern } from "./rectHatchPattern.js";

describe("SVG rectangle hatch patterns", () => {
    test.each([
        "diagonal",
        "antiDiagonal",
        "cross",
        "vertical",
        "horizontal",
        "grid",
        "dots",
        "rings",
        "ringsLarge",
    ])("creates %s geometry", (type) => {
        const pattern = createRectHatchPattern("hatch", {
            type,
            fill: "white",
            fillOpacity: 1,
            stroke: "black",
            strokeOpacity: 1,
            strokeWidth: 2,
        });

        expect(
            pattern.querySelector(":scope > g")?.childElementCount
        ).toBeGreaterThan(0);
    });

    test.each([
        ["diagonal", "M -2 -2 L 14 14"],
        ["antiDiagonal", "M -2 14 L 14 -2"],
    ])("matches the shader orientation for %s", (type, expectedPath) => {
        const pattern = createRectHatchPattern("hatch", {
            type,
            fill: "white",
            fillOpacity: 1,
            stroke: "black",
            strokeOpacity: 1,
            strokeWidth: 2,
        });
        const centralPath = pattern.querySelectorAll("path")[1];

        expect(centralPath.getAttribute("d")).toBe(expectedPath);
        expect(
            pattern.querySelector(":scope > g")?.getAttribute("stroke-linecap")
        ).toBe("square");
    });

    test.each([
        ["diagonal", "2"],
        ["vertical", "4"],
        ["horizontal", "4"],
        ["grid", "4"],
        ["dots", "2"],
    ])("matches the shader line width for %s", (type, expectedWidth) => {
        const pattern = createRectHatchPattern("hatch", {
            type,
            fill: "white",
            fillOpacity: 1,
            stroke: "black",
            strokeOpacity: 1,
            strokeWidth: 2,
        });

        expect(
            pattern.querySelector(":scope > g")?.getAttribute("stroke-width")
        ).toBe(expectedWidth);
    });
});
