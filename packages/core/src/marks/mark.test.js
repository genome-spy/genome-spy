import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import { createViewportScope } from "./mark.js";

describe("mark viewport scope", () => {
    test("clips only x when clipX is enabled", () => {
        const coords = Rectangle.create(1, 2, 6, 4);
        const clipRect = Rectangle.create(4, 3, 4, 2);
        const scope = createViewportScope(coords, {
            rect: clipRect,
            clipX: true,
            clipY: false,
        });

        expect(scope.usesScopedViewport).toBeTruthy();
        expect(scope.coords.equals(Rectangle.create(4, 2, 3, 4))).toBeTruthy();
        expect(scope.xClipOffset).toBe(-3);
        expect(scope.yClipOffset).toBe(0);
    });

    test("clips only y when clipY is enabled", () => {
        const coords = Rectangle.create(1, 2, 6, 4);
        const clipRect = Rectangle.create(4, 3, 4, 2);
        const scope = createViewportScope(coords, {
            rect: clipRect,
            clipX: false,
            clipY: true,
        });

        expect(scope.usesScopedViewport).toBeTruthy();
        expect(scope.coords.equals(Rectangle.create(1, 3, 6, 2))).toBeTruthy();
        expect(scope.xClipOffset).toBe(0);
        expect(scope.yClipOffset).toBe(1);
    });
});
