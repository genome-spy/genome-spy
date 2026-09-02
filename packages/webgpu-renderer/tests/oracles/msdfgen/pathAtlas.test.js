import { describe, expect, test } from "vitest";
import { buildPathAtlas } from "./pathAtlas.js";

describe("buildPathAtlas", () => {
    test("deduplicates tiles while retaining per-path UV entries", () => {
        const square = "M-1-1H1V1H-1Z";
        const atlas = buildPathAtlas([square, square], {
            tileSize: 32,
            spread: 8,
            shapePadding: 10,
            gutter: 1,
        });
        expect(atlas.pathCount).toBe(2);
        expect(atlas.uniquePathCount).toBe(1);
        expect(Array.from(atlas.entries.slice(0, 12))).toEqual(
            Array.from(atlas.entries.slice(12, 24))
        );
    });

    test("extrudes tile edges into the linear-filtering gutter", () => {
        const atlas = buildPathAtlas(["M-1-1H1V1H-1Z", "M0-1L1 1H-1Z"], {
            tileSize: 32,
            spread: 8,
            shapePadding: 10,
            gutter: 1,
        });
        /** @param {number} x @param {number} y */
        const pixel = (x, y) =>
            Array.from(
                atlas.data.slice(
                    (y * atlas.width + x) * 4,
                    (y * atlas.width + x) * 4 + 4
                )
            );
        expect(pixel(0, 0)).toEqual(pixel(1, 1));
        expect(pixel(33, 0)).toEqual(pixel(32, 1));
        expect(atlas.data.every(Number.isFinite)).toBe(true);
    });

    test("rejects a distance range that exceeds the shape margin", () => {
        expect(() =>
            buildPathAtlas(["M-1-1H1V1H-1Z"], {
                tileSize: 32,
                spread: 11,
                shapePadding: 10,
                gutter: 1,
            })
        ).toThrow(/invalid pathpoint atlas dimensions/i);
    });
});
