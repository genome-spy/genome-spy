// @ts-expect-error Node types are intentionally absent from the browser package.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
    createAsciiTrueTypeFont,
    createTrueTypeFont,
    loadTrueTypeFont,
    trueTypeGlyphToPath,
} from "./trueTypeFont.js";
import { parseTrueTypeFont } from "../vendor/textShaper/font/trueType.js";

const SOURCE_CODE_PRO = new URL(
    "../../../../node_modules/polished/docs/assets/fonts/TTF/SourceCodePro-Regular.ttf",
    import.meta.url
);
const DEFAULT_FONT = new URL("./DefaultFont.ttf", import.meta.url);

describe("ASCII TrueType adaptation", () => {
    test("extracts printable ASCII outlines and metrics", () => {
        const font = createAsciiTrueTypeFont(readFileSync(SOURCE_CODE_PRO));

        expect(font.unitsPerEm).toBe(1000);
        expect(font.paths).toHaveLength(94);
        expect(font.characters.size).toBe(95);
        expect(font.characters.get(" ")).toEqual({
            glyphId: 3,
            pathIndex: -1,
            advanceWidth: 600,
            bounds: null,
        });
        expect(font.characters.get("A")).toMatchObject({
            advanceWidth: 600,
            bounds: { xMin: 32, yMin: 0, xMax: 568, yMax: 656 },
        });
        expect(font.characters.get("i").pathIndex).toBeGreaterThanOrEqual(0);
        expect(font.paths[font.characters.get("A").pathIndex]).toMatch(
            /^M.*Q.*Z$/
        );
    });

    test("inserts implied points and flips the font y axis", () => {
        const path = trueTypeGlyphToPath({
            contours: [
                [
                    { x: 0, y: 20, onCurve: false },
                    { x: 20, y: 20, onCurve: false },
                    { x: 20, y: 0, onCurve: false },
                    { x: 0, y: 0, onCurve: false },
                ],
            ],
        });

        expect(path).toBe(
            "M10 -20Q20 -20 20 -10Q20 0 10 0Q0 0 0 -10Q0 -20 10 -20Z"
        );
    });

    test("rejects CFF OpenType data explicitly", () => {
        expect(() =>
            parseTrueTypeFont(Uint8Array.from([0x4f, 0x54, 0x54, 0x4f]))
        ).toThrow(/CFF OpenType fonts are not supported/i);
    });

    test("reads the plotting repertoire and kerning from Default Font", () => {
        const font = createTrueTypeFont(readFileSync(DEFAULT_FONT));
        const characters = "AVαΩ²−åöäÅÖÄ≤∞";

        for (const character of characters) {
            const glyph = font.getGlyph(character);
            expect(glyph.glyphId).not.toBe(0);
            expect(glyph.path).toMatch(/^M.*Z$/);
        }
        const adjustment = font.getPairAdjustment(
            font.getGlyph("A").glyphId,
            font.getGlyph("V").glyphId
        );
        expect(adjustment.firstAdvance).toBeLessThan(0);
        expect(font.getGlyph("A")).toBe(font.getGlyph("A"));
        expect(font.capHeight).toBe(font.getGlyph("H").bounds?.yMax);
    });

    test("deduplicates asynchronous loading by exact URL", async () => {
        const bytes = readFileSync(DEFAULT_FONT);
        const originalFetch = globalThis.fetch;
        /** @type {string[]} */
        const calls = [];
        globalThis.fetch = async (url) => {
            calls.push(String(url));
            return new Response(bytes);
        };
        try {
            const url = "https://example.test/fonts/default.ttf";
            const [first, second] = await Promise.all([
                loadTrueTypeFont(url),
                loadTrueTypeFont(url),
            ]);
            expect(first).toBe(second);
            expect(first.getGlyph("−").glyphId).not.toBe(0);
            expect(calls).toEqual([url]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
