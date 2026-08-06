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
});
