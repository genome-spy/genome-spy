import { describe, expect, test, vi } from "vitest";

// Register GenomeSpy's custom scale types with vega-scale.
import "../../../scales/scaleResolution.js";
import Rectangle from "../../../view/layout/rectangle.js";
import { createSelfClipOptions } from "../../../view/renderingContext/clipOptions.js";
import WebGLMark, {
    createLogicalVisibleRect,
    createViewportScope,
    getXIndexOffsetBound,
} from "./webGlMark.js";

describe("offset-aware x indexing", () => {
    /**
     * @param {import("../../../types/encoder.js").Encoder} xOffset
     * @param {{ offset?: number, indexedRange?: [number, number] }} [options]
     */
    function createIndexedRenderContext(
        xOffset,
        { offset = 0, indexedRange = [2, 5] } = {}
    ) {
        const lookup = vi.fn(
            (/** @type {number} */ _start, /** @type {number} */ _end, arr) => {
                arr[0] = indexedRange[0];
                arr[1] = indexedRange[1];
                return arr;
            }
        );
        const draw = vi.fn();
        const scale = Object.assign(() => 0, {
            type: "index",
            domain: () => [100, 200],
        });
        const resolution = {
            getScale: () => scale,
            getAxisLength: vi.fn(() => 100),
        };
        const rangeEntry = { offset, count: 10, xIndex: lookup };
        const mark = /** @type {any} */ ({
            bufferInfo: {},
            encoders: { xOffset },
            unitView: { getScaleResolution: () => resolution },
            rangeMap: { get: () => rangeEntry },
        });

        const render = WebGLMark.prototype.createRenderCallback.call(
            mark,
            draw,
            {}
        );
        render();

        return {
            draw,
            lookup,
            getAxisLength: resolution.getAxisLength,
            render,
        };
    }

    test("uses scaled and constant pixel bounds", () => {
        const scaled = Object.assign(() => 0, {
            scale: { range: () => [-12, 8] },
            constant: false,
        });
        const constant = Object.assign(() => -20, { constant: true });

        expect(
            getXIndexOffsetBound(
                /** @type {any} */ ({
                    xOffset: scaled,
                    x2Offset: constant,
                })
            )
        ).toBe(20);
    });

    test("expands an indexed domain by the bounded pixel offset", () => {
        const { draw, lookup, getAxisLength, render } =
            createIndexedRenderContext(
                /** @type {any} */ (
                    Object.assign(() => 0, {
                        scale: { range: () => [-10, 10] },
                        constant: false,
                    })
                )
            );

        expect(lookup).toHaveBeenCalledWith(89, 210, [2, 5]);
        expect(draw).toHaveBeenCalledWith(2, 3);
        render();
        expect(getAxisLength).toHaveBeenCalledTimes(1);
    });

    test("does not query axis length for a zero pixel offset", () => {
        const { draw, lookup, getAxisLength } = createIndexedRenderContext(
            /** @type {any} */ (Object.assign(() => 0, { constant: true }))
        );

        expect(lookup).toHaveBeenCalledWith(99, 200, [2, 5]);
        expect(draw).toHaveBeenCalledWith(2, 3);
        expect(getAxisLength).not.toHaveBeenCalled();
    });

    test("draws the full range when an indexed offset is unbounded", () => {
        const { draw, lookup } = createIndexedRenderContext(
            /** @type {any} */ (
                Object.assign((/** @type {any} */ datum) => datum.offset, {
                    constant: false,
                    scale: { type: "null" },
                })
            ),
            { offset: 4 }
        );

        expect(lookup).not.toHaveBeenCalled();
        expect(draw).toHaveBeenCalledWith(4, 10);
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
