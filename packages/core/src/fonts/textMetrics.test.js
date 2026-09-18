import { describe, expect, test } from "vitest";
import {
    getProjectedTextExtent,
    measureText,
    requestFont,
} from "./textMetrics.js";

function createMeasurement() {
    return /** @type {import("./textMetrics.js").FontMeasurement} */ ({
        measureWidth: (
            /** @type {string} */ text,
            /** @type {number} */ size
        ) => text.length * size,
        getHeight: (/** @type {number} */ size) => size * 0.9,
    });
}

function createProvider() {
    return /** @type {import("./textMetrics.js").TextMetricsProvider} */ ({
        requestFont: (config) => Object.assign(createMeasurement(), { config }),
        waitUntilReady: async () => undefined,
    });
}

describe("textMetrics", () => {
    test("requests the font manager default when no family is configured", () => {
        const font = requestFont(createProvider(), {});

        expect(font).toMatchObject({ config: {} });
    });

    test("requests configured weight from default family", () => {
        const font = requestFont(createProvider(), {
            fontWeight: "bold",
        });

        expect(font).toMatchObject({ config: { fontWeight: "bold" } });
    });

    test("requests configured font properties", () => {
        const font = requestFont(createProvider(), {
            font: "Lato",
            fontStyle: "italic",
            fontWeight: "bold",
        });

        expect(font).toMatchObject({
            config: {
                font: "Lato",
                fontStyle: "italic",
                fontWeight: "bold",
            },
        });
    });

    test("measures text width and height from a measurement handle", () => {
        const size = measureText(createMeasurement(), "ABC", 10);

        expect(size).toEqual({ width: 30, height: 9 });
    });

    test("projects text extent for horizontal and vertical layout directions", () => {
        const size = { width: 100, height: 10 };

        expect(getProjectedTextExtent(size, 0, "vertical")).toBe(10);
        expect(getProjectedTextExtent(size, 90, "vertical")).toBe(100);
        expect(getProjectedTextExtent(size, 0, "horizontal")).toBe(100);
        expect(getProjectedTextExtent(size, 90, "horizontal")).toBeCloseTo(10);
    });
});
