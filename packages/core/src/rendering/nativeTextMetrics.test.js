import { describe, expect, test, vi } from "vitest";
import NativeTextMetricsProvider from "./nativeTextMetrics.js";

function createFixture() {
    const measureText = vi.fn((/** @type {string} */ text) => ({
        width: text.length * 10,
        actualBoundingBoxAscent: 7,
        actualBoundingBoxDescent: 2,
    }));
    const context = /** @type {CanvasRenderingContext2D} */ (
        /** @type {unknown} */ ({
            font: "",
            fontKerning: "auto",
            direction: "inherit",
            textAlign: "start",
            textBaseline: "alphabetic",
            measureText,
        })
    );
    const provider = new NativeTextMetricsProvider(context);
    return { provider, measureText };
}

describe("NativeTextMetricsProvider", () => {
    test("caches ASCII widths for the current size", () => {
        const { provider, measureText } = createFixture();
        const measurement = provider.requestFont({});

        expect(measurement.measureWidth("A", 11)).toBe(10);
        expect(measurement.measureWidth("A", 11)).toBe(10);
        expect(measureText).toHaveBeenCalledOnce();

        measurement.measureWidth("A", 12);
        expect(measureText).toHaveBeenCalledTimes(2);
    });

    test("does not cache non-ASCII or multi-character strings", () => {
        const { provider, measureText } = createFixture();
        const measurement = provider.requestFont({});

        measurement.measureWidth("Å", 11);
        measurement.measureWidth("Å", 11);
        measurement.measureWidth("AC", 11);
        measurement.measureWidth("AC", 11);

        expect(measureText).toHaveBeenCalledTimes(4);
    });

    test("uses representative native ascent and descent for height", () => {
        const { provider } = createFixture();
        const measurement = provider.requestFont({});

        expect(measurement.getHeight(11)).toBe(9);
        expect(measurement.getHeight(11)).toBe(9);
    });
});
