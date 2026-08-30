import { describe, expect, test, vi } from "vitest";

// Register GenomeSpy's custom scale types with vega-scale.
import "../../../scales/scaleResolution.js";
import Rectangle from "../../../view/layout/rectangle.js";
import { createSelfClipOptions } from "../../../view/renderingContext/clipOptions.js";
import WebGLMark, {
    createLogicalVisibleRect,
    createViewportScope,
} from "./webGlMark.js";

describe("guarded x indexing", () => {
    test("expands an indexed domain by one viewport", () => {
        const lookup = vi.fn(
            (/** @type {number} */ _start, /** @type {number} */ _end, arr) => {
                arr[0] = 2;
                arr[1] = 5;
                return arr;
            }
        );
        const draw = vi.fn();
        const scale = Object.assign(() => 0, {
            type: "index",
            domain: () => [100, 200],
        });
        const mark = /** @type {any} */ ({
            bufferInfo: {},
            unitView: {
                getScaleResolution: () => ({ getScale: () => scale }),
            },
            rangeMap: {
                get: () => ({ offset: 0, count: 10, xIndex: lookup }),
            },
        });
        const render = WebGLMark.prototype.createRenderCallback.call(
            mark,
            draw,
            {}
        );
        render();

        expect(lookup).toHaveBeenCalledWith(-1, 300, [2, 5]);
        expect(draw).toHaveBeenCalledWith(2, 3);
    });
});

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

describe("mark logical visible rect", () => {
    test("maps inherited clip bounds to unit coordinates", () => {
        const coords = Rectangle.create(10, 20, 100, 50);
        const clip = {
            rect: Rectangle.create(35, 30, 50, 20),
            clipX: true,
            clipY: true,
        };

        expect(createLogicalVisibleRect(coords, clip)).toEqual([
            0.25, 0.4, 0.75, 0.8,
        ]);
    });

    test("keeps full range for unclipped directions", () => {
        const coords = Rectangle.create(10, 20, 100, 50);
        const clip = {
            rect: Rectangle.create(35, 30, 50, 20),
            clipX: false,
            clipY: true,
        };

        expect(createLogicalVisibleRect(coords, clip)).toEqual([
            0, 0.4, 1, 0.8,
        ]);
    });

    test("uses full rect when no clip is available", () => {
        const coords = Rectangle.create(10, 20, 100, 50);

        expect(createLogicalVisibleRect(coords, undefined)).toEqual([
            0, 0, 1, 1,
        ]);
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
