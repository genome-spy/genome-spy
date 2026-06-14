import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import { createViewportScope, resolveViewportClip } from "./mark.js";

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
        expect(scope.xClipOffset).toBe(-3);
        expect(scope.yClipOffset).toBe(0);
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
        expect(scope.xClipOffset).toBe(0);
        expect(scope.yClipOffset).toBe(1);
    });
});

describe("mark viewport clip resolution", () => {
    test("explicit clip false suppresses inherited render clip", () => {
        const coords = Rectangle.create(1, 2, 6, 4);
        const clip = {
            rect: Rectangle.create(0, 0, 10, 10),
            clipX: false,
            clipY: true,
        };

        expect(resolveViewportClip(false, coords, clip, true)).toBeUndefined();
    });

    test("default clip false preserves inherited render clip", () => {
        const coords = Rectangle.create(1, 2, 6, 4);
        const clip = {
            rect: Rectangle.create(0, 0, 10, 10),
            clipX: false,
            clipY: true,
        };

        expect(resolveViewportClip(false, coords, clip, false)).toBe(clip);
    });

    test("clip true falls back to the mark rectangle", () => {
        const coords = Rectangle.create(1, 2, 6, 4);

        expect(
            resolveViewportClip(true, coords, undefined, false)
        ).toMatchObject({
            rect: coords,
            clipX: true,
            clipY: true,
        });
    });
});
