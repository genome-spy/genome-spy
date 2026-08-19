import { describe, expect, test } from "vitest";
import Rectangle from "../../view/layout/rectangle.js";
import {
    createAnchorCullBounds,
    createVisibleBounds,
    hasVisibleArea,
    intersectsBounds,
    isOutsideBounds,
} from "./bounds.js";

describe("SVG visible bounds", () => {
    test("combines directional clips with the root viewport", () => {
        expect(
            createVisibleBounds(100, 80, {
                rect: Rectangle.create(20, -50, 40, 200),
                clipX: true,
                clipY: false,
            })
        ).toEqual({ x1: 20, y1: 0, x2: 60, y2: 80 });

        expect(
            createVisibleBounds(100, 80, {
                rect: Rectangle.create(-50, 10, 200, 30),
                clipX: false,
                clipY: true,
            })
        ).toEqual({ x1: 0, y1: 10, x2: 100, y2: 40 });
    });

    test("detects empty clips and conservatively retains stroked edges", () => {
        const outside = createVisibleBounds(100, 80, {
            rect: Rectangle.create(120, 0, 20, 20),
            clipX: true,
            clipY: true,
        });
        expect(hasVisibleArea(outside)).toBe(false);

        const visible = { x1: 0, y1: 0, x2: 100, y2: 80 };
        expect(intersectsBounds(visible, -3, 20, -2, 30)).toBe(false);
        expect(intersectsBounds(visible, -3, 20, -2, 30, 2)).toBe(true);
    });

    test("creates directional anchor bounds from the inherited clip", () => {
        const bounds = createAnchorCullBounds(
            Rectangle.create(10, 20, 100, 80),
            {
                rect: Rectangle.create(30, 40, 50, 30),
                clipX: true,
                clipY: true,
            },
            "y"
        );

        expect(bounds).toEqual({
            x1: -Infinity,
            y1: 40,
            x2: Infinity,
            y2: 70,
        });
        expect(isOutsideBounds(bounds, -1000, 39)).toBe(true);
        expect(isOutsideBounds(bounds, -1000, 40)).toBe(false);
        expect(isOutsideBounds(bounds, 1000, 70)).toBe(false);
        expect(isOutsideBounds(bounds, 1000, 71)).toBe(true);
    });
});
