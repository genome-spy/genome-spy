import { describe, expect, test } from "vitest";
import SoftwarePickingBuffer from "./softwarePickingBuffer.js";
import SoftwarePickingRasterizer from "./softwarePickingRasterizer.js";

describe("SoftwarePickingRasterizer", () => {
    test("fills clipped conservative rectangle spans in painter order", () => {
        const buffer = new SoftwarePickingBuffer(6, 5);
        const rasterizer = new SoftwarePickingRasterizer(buffer);

        rasterizer.fillRect(1, 1.25, 1.25, 2.5, 1.5);
        rasterizer.setClip(2, 0, 5, 4);
        rasterizer.fillRect(2, 0, 2, 6, 3);

        expect(rows(buffer)).toEqual([
            [0, 0, 0, 0, 0, 0],
            [0, 1, 1, 1, 0, 0],
            [0, 1, 2, 2, 2, 0],
            [0, 0, 2, 2, 2, 0],
            [0, 0, 0, 0, 0, 0],
        ]);
    });

    test("stamps squares and clips extreme segments before walking them", () => {
        const buffer = new SoftwarePickingBuffer(7, 7);
        const rasterizer = new SoftwarePickingRasterizer(buffer);

        rasterizer.fillSquare(4, 1.5, 1.5, 0.5);
        rasterizer.strokeSegment(3, 3, -1e9, 3, 1e9, 1);

        expect(buffer.read(1, 1)).toBe(4);
        expect(buffer.read(3, 0)).toBe(3);
        expect(buffer.read(3, 6)).toBe(3);
        expect(buffer.read(0, 6)).toBe(0);
    });

    test("fills convex polygons and conservatively covers their edges", () => {
        const buffer = new SoftwarePickingBuffer(7, 7);
        const rasterizer = new SoftwarePickingRasterizer(buffer);

        rasterizer.fillConvexPolygon(9, [3, 1, 5, 3, 3, 5, 1, 3]);

        expect(buffer.read(3, 3)).toBe(9);
        expect(buffer.read(3, 1)).toBe(9);
        expect(buffer.read(1, 3)).toBe(9);
        expect(buffer.read(0, 0)).toBe(0);
        expect(buffer.read(6, 6)).toBe(0);
    });

    test("adaptively flattens cubic curves without filling their bounds", () => {
        const buffer = new SoftwarePickingBuffer(8, 8);
        const rasterizer = new SoftwarePickingRasterizer(buffer);

        rasterizer.strokeCubic(5, 1, 6, 1, 1, 6, 1, 6, 6, 1);

        expect(buffer.read(1, 6)).toBe(5);
        expect(buffer.read(6, 6)).toBe(5);
        expect(buffer.read(3, 2)).toBe(5);
        expect(buffer.read(3, 5)).toBe(0);
    });

    test("terminates on a degenerate cubic", () => {
        const buffer = new SoftwarePickingBuffer(8, 8);
        const rasterizer = new SoftwarePickingRasterizer(buffer);

        rasterizer.strokeCubic(6, 4, 4, 4, 4, 4, 4, 4, 4, 2);

        expect(buffer.read(3, 3)).toBe(6);
        expect(buffer.read(4, 4)).toBe(6);
        expect(buffer.read(2, 2)).toBe(0);
    });

    test("bounds extreme cubic geometry and ignores nonfinite controls", () => {
        const buffer = new SoftwarePickingBuffer(8, 8);
        const rasterizer = new SoftwarePickingRasterizer(buffer);

        expect(() =>
            rasterizer.strokeCubic(7, -1e9, 4, 1e9, -1e9, -1e9, 1e9, 1e9, 4, 1)
        ).not.toThrow();
        const snapshot = Array.from(buffer.ids);
        rasterizer.strokeCubic(8, 0, 0, NaN, 1, 2, 2, 3, 3, 1);

        expect(buffer.ids).toHaveLength(64);
        expect(Array.from(buffer.ids)).toEqual(snapshot);
    });

    test("rejects malformed polygons and clips reversed rectangles", () => {
        const buffer = new SoftwarePickingBuffer(4, 4);
        const rasterizer = new SoftwarePickingRasterizer(buffer);
        rasterizer.setClip(3, 3, 1, 1);

        expect(() => rasterizer.fillConvexPolygon(1, [0, 0, 1, 1])).toThrow(
            "at least three"
        );
        rasterizer.fillRect(2, 3, 3, -3, -3);

        expect(buffer.read(1, 1)).toBe(2);
        expect(buffer.read(2, 2)).toBe(2);
        expect(buffer.read(0, 0)).toBe(0);
        expect(buffer.read(3, 3)).toBe(0);
    });

    test("aggregates primitive statistics without retaining occurrences", () => {
        const buffer = new SoftwarePickingBuffer(8, 8);
        const rasterizer = new SoftwarePickingRasterizer(buffer);

        rasterizer.fillRect(1, 0, 0, 1, 1);
        rasterizer.fillSquare(1, 2, 2, 1);
        rasterizer.fillConvexPolygon(1, [3, 1, 5, 1, 4, 3]);
        rasterizer.strokeSegment(1, 0, 7, 7, 7, 1);
        rasterizer.strokeCubic(1, 0, 4, 2, 2, 5, 2, 7, 4, 1);

        expect(rasterizer.getStatistics()).toMatchObject({
            rectangles: 1,
            squares: 1,
            polygons: 1,
            cubics: 1,
        });
        expect(rasterizer.getStatistics().segments).toBeGreaterThan(4);
        expect(rasterizer.getStatistics().spans).toBeGreaterThan(0);

        rasterizer.resetStatistics();
        expect(rasterizer.getStatistics()).toEqual({
            rectangles: 0,
            squares: 0,
            polygons: 0,
            segments: 0,
            cubics: 0,
            spans: 0,
        });
    });
});

/**
 * @param {SoftwarePickingBuffer} buffer
 * @returns {number[][]}
 */
function rows(buffer) {
    return Array.from({ length: buffer.height }, (_, row) =>
        Array.from(
            buffer.ids.subarray(row * buffer.width, (row + 1) * buffer.width)
        )
    );
}
