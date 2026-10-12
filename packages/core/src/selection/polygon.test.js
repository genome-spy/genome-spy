import { describe, expect, it } from "vitest";
import { createPolygonPredicate } from "./polygon.js";

/** @type {[number, number][]} */
const square = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
];

describe("polygon containment", () => {
    it("includes fractional slanted boundaries in both windings without including an outside neighbor", () => {
        /** @type {[number, number][]} */
        const triangle = [
            [0.1, 0.2],
            [0.2, 0.6],
            [0, 10],
        ];
        for (const polygon of [triangle, triangle.toReversed()]) {
            const contains = createPolygonPredicate(polygon);
            expect(contains(0.15000000000000002, 0.4)).toBe(true);
            expect(contains(0.15 + 1e-9, 0.4)).toBe(false);
            expect(contains(0.15 - 1e-9, 0.4)).toBe(true);
        }
    });

    it("includes the interior, edges, and vertices in either winding", () => {
        for (const polygon of [square, square.toReversed()]) {
            const contains = createPolygonPredicate(polygon);
            expect(contains(2, 2)).toBe(true);
            expect(contains(0, 2)).toBe(true);
            expect(contains(2, 4)).toBe(true);
            expect(contains(4, 0)).toBe(true);
            expect(contains(-1, 2)).toBe(false);
            expect(contains(2, 5)).toBe(false);
            expect(contains(4 + 1e-9, 2)).toBe(false);
        }
    });

    it("excludes a concave notch inside the bounding box", () => {
        const contains = createPolygonPredicate([
            [0, 0],
            [4, 0],
            [4, 1],
            [1, 1],
            [1, 4],
            [0, 4],
        ]);
        expect(contains(0.5, 3)).toBe(true);
        expect(contains(3, 0.5)).toBe(true);
        expect(contains(3, 3)).toBe(false);
        expect(contains(1, 2)).toBe(true);
    });

    it("uses even–odd membership for a self-crossing zero-signed-area trace", () => {
        const contains = createPolygonPredicate([
            [0, 0],
            [4, 4],
            [0, 4],
            [4, 0],
        ]);
        expect(contains(2, 0.5)).toBe(true);
        expect(contains(2, 3.5)).toBe(true);
        expect(contains(0.5, 2)).toBe(false);
        expect(contains(2, 2)).toBe(true);
    });

    it("accepts repeated vertices and an explicit closing vertex", () => {
        const contains = createPolygonPredicate([
            square[0],
            square[0],
            ...square.slice(1),
            square[0],
        ]);
        expect(contains(2, 2)).toBe(true);
        expect(contains(0, 0)).toBe(true);
        expect(contains(5, 2)).toBe(false);
    });

    it("captures the polygon independently of caller edits", () => {
        const polygon = square.map(
            ([x, y]) => /** @type {[number, number]} */ ([x, y])
        );
        const contains = createPolygonPredicate(polygon);
        polygon[1][0] = -100;
        polygon.length = 0;
        expect(contains(2, 2)).toBe(true);
    });

    it("rejects incomplete, non-finite, and collinear polygons", () => {
        /** @type {[number, number][][]} */
        const invalid = [
            [],
            [
                [0, 0],
                [1, 1],
            ],
            [
                [0, 0],
                [0, 0],
                [0, 0],
            ],
            [
                [0, 0],
                [1, 1],
                [2, 2],
            ],
            [
                [0, 0],
                [1, 0],
                [NaN, 2],
            ],
            [
                [0, 0],
                [1, 0],
                [2, Infinity],
            ],
        ];
        for (const polygon of invalid) {
            expect(() => createPolygonPredicate(polygon)).toThrow(
                /region polygon/
            );
        }
    });

    it("rejects invalid point coordinates and preserves small spans at large offsets", () => {
        const contains = createPolygonPredicate(square);
        expect(contains(NaN, 2)).toBe(false);
        expect(contains(2, Infinity)).toBe(false);
        expect(contains(/** @type {any} */ ("2"), 2)).toBe(false);

        // These distinct values collapse together in a plain f32 position buffer.
        const offset = 1e9;
        const large = createPolygonPredicate(
            square.map(([x, y]) => [offset + x, offset + y])
        );
        expect(large(offset + 0.5, offset + 0.5)).toBe(true);
        expect(large(offset + 4.5, offset + 0.5)).toBe(false);
    });
});
