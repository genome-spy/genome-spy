import { expect, test } from "vitest";
import { layoutPathTextLines } from "./pathTextScene.js";

test("path text applies pair placement and advance adjustments", () => {
    const glyph = {
        pathIndex: 0,
        advanceWidth: 600,
        bounds: { xMin: 0, yMin: 0, xMax: 500, yMax: 700 },
    };
    const font = {
        unitsPerEm: 1000,
        characters: new Map([
            ["A", { ...glyph, glyphId: 1 }],
            ["V", { ...glyph, glyphId: 2 }],
        ]),
        getPairAdjustment(leftGlyphId, rightGlyphId) {
            return leftGlyphId === 1 && rightGlyphId === 2
                ? {
                      firstPlacement: 0,
                      firstAdvance: -100,
                      secondPlacement: -20,
                      secondAdvance: -30,
                  }
                : {
                      firstPlacement: 0,
                      firstAdvance: 0,
                      secondPlacement: 0,
                      secondAdvance: 0,
                  };
        },
    };

    const instances = layoutPathTextLines(font, [
        {
            text: "AVA",
            x: 10,
            baseline: 100,
            size: 100,
            stroke: 0,
        },
    ]);

    expect(instances).toHaveLength(3);
    expect(instances[0].x).toBe(35);
    expect(instances[1].x).toBe(83);
    expect(instances[2].x).toBe(142);
});
