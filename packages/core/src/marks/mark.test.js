import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import { createSelfClipOptions, createViewportScope } from "./mark.js";

describe("mark viewport scope", () => {
    test("clips only x when clipX is enabled", () => {
        const canvasSize = { width: 20, height: 10 };
        const coords = Rectangle.create(1, 2, 6, 4);
        const clipRect = Rectangle.create(4, 3, 4, 2);
        const scope = createViewportScope(canvasSize, coords, {
            rect: clipRect,
            clipX: true,
            clipY: false,
        });

        expect(scope.requiresScissor).toBeTruthy();
        expect(scope.coords.equals(Rectangle.create(4, 0, 3, 10))).toBeTruthy();
    });

    test("clips only y when clipY is enabled", () => {
        const canvasSize = { width: 20, height: 10 };
        const coords = Rectangle.create(1, 2, 6, 4);
        const clipRect = Rectangle.create(4, 3, 4, 2);
        const scope = createViewportScope(canvasSize, coords, {
            rect: clipRect,
            clipX: false,
            clipY: true,
        });

        expect(scope.requiresScissor).toBeTruthy();
        expect(scope.coords.equals(Rectangle.create(0, 3, 20, 2))).toBeTruthy();
    });

    test("uses inherited clip bounds without self-clipping", () => {
        const canvasSize = { width: 20, height: 10 };
        const coords = Rectangle.create(1, 2, 6, 4);
        const clipRect = Rectangle.create(4, 0, 4, 10);
        const scope = createViewportScope(
            canvasSize,
            coords,
            {
                rect: clipRect,
                clipX: false,
                clipY: true,
            },
            false
        );

        expect(scope.requiresScissor).toBeTruthy();
        expect(
            scope.coords.equals(Rectangle.create(0, 0, 20, 10))
        ).toBeTruthy();
    });
});

describe("mark self clip options", () => {
    test("maps directional mark clip values", () => {
        const coords = Rectangle.create(1, 2, 6, 4);

        expect(createSelfClipOptions(true, coords)).toMatchObject({
            rect: coords,
            clipX: true,
            clipY: true,
        });
        expect(createSelfClipOptions("x", coords)).toMatchObject({
            rect: coords,
            clipX: true,
            clipY: false,
        });
        expect(createSelfClipOptions("y", coords)).toMatchObject({
            rect: coords,
            clipX: false,
            clipY: true,
        });
        expect(createSelfClipOptions(false, coords)).toBeUndefined();
        expect(createSelfClipOptions("never", coords)).toBeUndefined();
    });
});
