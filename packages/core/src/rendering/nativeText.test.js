import { describe, expect, test } from "vitest";
import {
    createNativeFontFamily,
    getNativeBaselineOffset,
} from "./nativeText.js";

describe("native text", () => {
    test("formats a portable sans-serif fallback stack", () => {
        expect(createNativeFontFamily("Open Sans")).toBe(
            "'Open Sans', 'Lato', 'Avenir Next', 'Avenir', 'Segoe UI', 'Ubuntu', 'Noto Sans', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
        );
    });

    test("preserves generic font families as CSS keywords", () => {
        expect(createNativeFontFamily("sans-serif")).toBe(
            "sans-serif, 'Lato', 'Avenir Next', 'Avenir', 'Segoe UI', 'Ubuntu', 'Noto Sans', 'Helvetica Neue', 'Helvetica', 'Arial'"
        );
        expect(createNativeFontFamily("SERIF")).toMatch(/^serif, /);
    });

    test("provides normalized baseline offsets", () => {
        expect(getNativeBaselineOffset("middle", 1)).toBe(0.35);
        expect(getNativeBaselineOffset("baseline", 10)).toBe(0);
    });
});
