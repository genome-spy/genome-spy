import { describe, expect, it } from "vitest";
import BmFontManager from "./bmFontManager.js";
import { buildTextLayout } from "./layout.js";

describe("buildTextLayout", () => {
    it("builds glyph arrays and measures width", () => {
        const fontManager = new BmFontManager();
        const fontEntry = fontManager.getFont("Lato", "normal", 400);
        const metrics = fontEntry.metrics;
        const base = metrics.common.base;
        const fontSize = 12;
        const scale = fontSize / base;

        const layout = buildTextLayout({
            strings: ["ab"],
            fontManager,
            font: { family: "Lato", style: "normal", weight: 400 },
            fontSize,
        });

        const expected =
            (metrics.getChar("a").xadvance + metrics.getChar("b").xadvance) *
            scale;

        expect(layout.glyphIds.length).toBe(2);
        expect(layout.stringIndex.length).toBe(2);
        expect(layout.textWidth[0]).toBeCloseTo(expected, 5);
        expect(layout.textHeight[0]).toBeGreaterThan(0);
    });

    it("adds y offsets for multiline text", () => {
        const fontManager = new BmFontManager();
        const fontEntry = fontManager.getFont("Lato", "normal", 400);
        const metrics = fontEntry.metrics;
        const fontSize = 10;
        const scale = fontSize / metrics.common.base;
        const lineAdvance = metrics.common.lineHeight * scale;

        const layout = buildTextLayout({
            strings: ["a\nb"],
            fontManager,
            font: { family: "Lato", style: "normal", weight: 400 },
            fontSize,
        });

        expect(layout.yOffset).not.toBeNull();
        expect(layout.glyphIds.length).toBe(2);
        expect(layout.yOffset[0]).toBeCloseTo(0, 5);
        expect(layout.yOffset[1]).toBeCloseTo(-lineAdvance, 5);
    });

    it("accounts for letter spacing", () => {
        const fontManager = new BmFontManager();
        const fontEntry = fontManager.getFont("Lato", "normal", 400);
        const metrics = fontEntry.metrics;
        const base = metrics.common.base;
        const fontSize = 12;
        const scale = fontSize / base;
        const letterSpacing = 2;

        const layout = buildTextLayout({
            strings: ["ab"],
            fontManager,
            font: { family: "Lato", style: "normal", weight: 400 },
            fontSize,
            letterSpacing,
        });

        const expected =
            (metrics.getChar("a").xadvance + metrics.getChar("b").xadvance) *
                scale +
            letterSpacing;

        expect(layout.textWidth[0]).toBeCloseTo(expected, 5);
    });

    it("returns line height for empty strings", () => {
        const fontManager = new BmFontManager();
        const fontEntry = fontManager.getFont("Lato", "normal", 400);
        const metrics = fontEntry.metrics;
        const fontSize = 10;
        const scale = fontSize / metrics.common.base;
        const expected = metrics.common.lineHeight * scale;

        const layout = buildTextLayout({
            strings: [""],
            fontManager,
            font: { family: "Lato", style: "normal", weight: 400 },
            fontSize,
        });

        expect(layout.glyphIds.length).toBe(0);
        expect(layout.textHeight[0]).toBeCloseTo(expected, 5);
    });
});
