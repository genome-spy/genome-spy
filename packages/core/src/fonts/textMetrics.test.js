import { describe, expect, test } from "vitest";
import {
    getProjectedTextExtent,
    getTextHeight,
    measureText,
    requestFont,
} from "./textMetrics.js";

function createMetrics() {
    return /** @type {import("./bmFontMetrics.js").BMFontMetrics} */ ({
        common: { base: 10 },
        capHeight: 7,
        descent: 2,
        measureWidth: (
            /** @type {string} */ text,
            /** @type {number} */ size
        ) => text.length * size,
    });
}

function createFontManager() {
    return /** @type {import("./textMetrics.js").FontManagerLike} */ ({
        getDefaultFont: () => ({ metrics: createMetrics() }),
        getFont: (
            /** @type {string} */ family,
            /** @type {import("../spec/font.js").FontStyle | undefined} */ fontStyle,
            /** @type {import("../spec/font.js").FontWeight | undefined} */ fontWeight
        ) => ({
            family,
            fontStyle,
            fontWeight,
            metrics: createMetrics(),
        }),
    });
}

describe("textMetrics", () => {
    test("requests the default font when no family is configured", () => {
        const font = requestFont(createFontManager(), {});

        expect(font.metrics).toBeDefined();
    });

    test("requests configured font properties", () => {
        const font = requestFont(createFontManager(), {
            font: "Lato",
            fontStyle: "italic",
            fontWeight: "bold",
        });

        expect(font).toMatchObject({
            family: "Lato",
            fontStyle: "italic",
            fontWeight: "bold",
        });
    });

    test("measures text width and height from BMFont metrics", () => {
        const size = measureText(createMetrics(), "ABC", 10);

        expect(size).toEqual({ width: 30, height: 9 });
    });

    test("computes text height from cap height and descent", () => {
        expect(getTextHeight(createMetrics(), 20)).toBe(18);
    });

    test("projects text extent for horizontal and vertical layout directions", () => {
        const size = { width: 100, height: 10 };

        expect(getProjectedTextExtent(size, 0, "vertical")).toBe(10);
        expect(getProjectedTextExtent(size, 90, "vertical")).toBe(100);
        expect(getProjectedTextExtent(size, 0, "horizontal")).toBe(100);
        expect(getProjectedTextExtent(size, 90, "horizontal")).toBeCloseTo(10);
    });
});
