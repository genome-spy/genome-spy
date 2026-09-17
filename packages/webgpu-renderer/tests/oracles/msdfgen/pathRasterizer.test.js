import { describe, expect, test } from "vitest";
import { svgPathToGlyphPath } from "../../../src/vendor/vegaScenegraph/toGlyphPath.js";
import { encodePathEdges, renderPathMsdf } from "./pathRasterizer.js";

/** @param {{ buffer: Uint8Array, pitch: number }} bitmap @param {number} x @param {number} y */
function medianAt(bitmap, x, y) {
    const offset = y * bitmap.pitch + x * 3;
    const [r, g, b] = bitmap.buffer.subarray(offset, offset + 3);
    return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
}

describe("canonical path MSDF rasterizer", () => {
    test("snaps arc-converted contours to exact closure", () => {
        const circle = svgPathToGlyphPath("M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z");
        const encoded = encodePathEdges(circle);
        expect(encoded.contourOffsets).toEqual(new Uint32Array([0, 4]));

        const bitmap = renderPathMsdf(circle, {
            width: 64,
            height: 64,
            scale: 20,
            offsetX: 32,
            offsetY: 32,
            spread: 8,
        });
        expect(medianAt(bitmap, 32, 32)).toBeGreaterThan(128);
        expect(medianAt(bitmap, 4, 4)).toBeLessThan(128);
    });

    test("converts same-winding even-odd contours to an oriented hole", () => {
        const path = svgPathToGlyphPath("M-1-1H1V1H-1ZM-.5-.5H.5V.5H-.5Z");
        const bitmap = renderPathMsdf(path, {
            width: 64,
            height: 64,
            scale: 20,
            offsetX: 32,
            offsetY: 32,
            spread: 8,
        });
        expect(medianAt(bitmap, 32, 32)).toBeLessThan(128);
        expect(medianAt(bitmap, 45, 32)).toBeGreaterThan(128);
    });

    test("preserves even-odd exclusion where contours overlap", () => {
        const path = svgPathToGlyphPath("M-1-.7H.3V.7H-1ZM-.3-1H1V1H-.3Z");
        const bitmap = renderPathMsdf(path, {
            width: 64,
            height: 64,
            scale: 20,
            offsetX: 32,
            offsetY: 32,
            spread: 8,
        });
        expect(medianAt(bitmap, 32, 32)).toBeLessThan(128);
        expect(medianAt(bitmap, 32, 10)).toBeGreaterThan(128);
    });

    test("rejects open contours before entering WASM", () => {
        const open = svgPathToGlyphPath("M0 0Q.5 1 1 0");
        expect(() => encodePathEdges(open)).toThrow(/close every contour/i);
    });
});
