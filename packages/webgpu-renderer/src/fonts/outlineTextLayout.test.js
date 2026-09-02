// @ts-expect-error Node types are intentionally absent from the browser package.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { createTrueTypeFont } from "./trueTypeFont.js";
import { buildOutlineTextLayout } from "./outlineTextLayout.js";

const DEFAULT_FONT = new URL("./DefaultFont.ttf", import.meta.url);

describe("outline text layout", () => {
    test("keeps spaces logical and applies pair positioning", () => {
        const font = createTrueTypeFont(readFileSync(DEFAULT_FONT));
        const kerned = buildOutlineTextLayout(["AV A"], font, {
            fontSize: 1000,
        });
        const unkerned = buildOutlineTextLayout(
            ["AV A"],
            {
                ...font,
                getPairAdjustment: () => ({
                    firstPlacement: 0,
                    firstAdvance: 0,
                    secondPlacement: 0,
                    secondAdvance: 0,
                }),
            },
            { fontSize: 1000 }
        );

        expect(kerned.glyphIds).toHaveLength(3);
        expect(kerned.paths).toHaveLength(2);
        expect(kerned.xOffset[1]).toBeLessThan(unkerned.xOffset[1]);
        expect(kerned.textWidth[0]).toBeLessThan(unkerned.textWidth[0]);
    });

    test("tracks multiline offsets at logical-string cardinality", () => {
        const font = createTrueTypeFont(readFileSync(DEFAULT_FONT));
        const layout = buildOutlineTextLayout(["A\nV", "X"], font, {
            fontSize: 20,
        });

        expect(layout.textWidth).toHaveLength(2);
        expect(layout.stringIndex).toEqual(new Uint32Array([0, 0, 1]));
        expect(layout.yOffset[1]).toBeCloseTo(-layout.lineAdvance);
        expect(layout.textHeight[0]).toBeCloseTo(layout.lineAdvance * 2);
        expect(layout.descent).toBeCloseTo(
            (-font.descender * 20) / font.unitsPerEm
        );
    });
});
