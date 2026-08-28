import { describe, expect, test, vi } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import { createSelfClipOptions } from "../view/renderingContext/clipOptions.js";
import UnitView from "../view/unitView.js";
import { create } from "../view/testUtils.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import LayerView from "../view/layerView.js";
import WebGLMark from "../rendering/webgl/marks/webGlMark.js";
import {
    createLogicalVisibleRect,
    createViewportScope,
    getXIndexOffsetBound,
} from "../rendering/webgl/marks/webGlMark.js";

describe("mark factory", () => {
    test("creates arrow marks", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32, band: "A" }] },
                mark: {
                    type: "arrow",
                    headAngle: 45,
                    headNotchAngle: 90,
                    size: 12,
                    headWidth: 2,
                },
                encoding: {
                    x: { field: "start", type: "index" },
                    x2: { field: "end" },
                    y: { field: "band", type: "nominal" },
                },
            },
            UnitView
        );

        expect(view.mark.constructor.name).toBe("ArrowMark");
    });

    test("derives offset defaults and picking IDs from mark properties", async () => {
        const view = await create({ mark: "point" }, UnitView);

        expect(view.mark.encoding).toMatchObject({
            xOffset: { value: 0 },
            yOffset: { value: 0 },
            uniqueId: { field: UNIQUE_ID_KEY },
        });
    });
});

describe("supported mark channels", () => {
    /** @type {[import("../spec/mark.js").MarkType | import("../spec/mark.js").MarkProps, string][]} */
    const cases = [
        ["point", "text"],
        ["rect", "text"],
        ["rule", "text"],
        [{ type: "tick", orient: "vertical" }, "text"],
        ["text", "shape"],
        ["link", "text"],
        ["arrow", "text"],
    ];

    test.each(cases)(
        "%s filters unsupported inherited channels once in UnitView",
        async (mark, unsupportedChannel) => {
            const layer = await create(
                {
                    encoding: {
                        x: { value: 0.5 },
                        text: { value: "inherited" },
                        shape: { value: "square" },
                    },
                    layer: [{ mark }],
                },
                LayerView
            );
            const child = /** @type {UnitView} */ (Array.from(layer)[0]);

            expect(
                /** @type {Record<string, any>} */ (child.getEncoding())[
                    unsupportedChannel
                ]
            ).toBeUndefined();
            expect(
                /** @type {Record<string, any>} */ (child.mark.encoding)[
                    unsupportedChannel
                ]
            ).toBeUndefined();
        }
    );
});

describe("mark rendering revisions", () => {
    test("owns expression-backed configuration and resource revisions", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32 }] },
                params: [
                    { name: "offset", value: 0 },
                    { name: "headWidth", value: 2 },
                ],
                mark: {
                    type: "arrow",
                    headWidth: { expr: "headWidth" },
                },
                encoding: {
                    x: {
                        expr: "datum.start + offset",
                        type: "quantitative",
                    },
                    x2: { field: "end" },
                    y: { value: 0.5 },
                },
            },
            UnitView
        );

        const watchExpression = vi.spyOn(view.paramRuntime, "watchExpression");
        view.mark.initializeEncoders();
        expect(watchExpression).not.toHaveBeenCalled();
        view.mark.initializeRenderingRevisions(["headWidth"]);
        expect(watchExpression).toHaveBeenCalledTimes(2);
        expect(view.mark.getRenderingRevision("configuration")).toBe(0);
        expect(view.mark.getRenderingRevision("resources")).toBe(0);

        view.paramRuntime.setValue("offset", 1);
        expect(view.mark.getRenderingRevision("configuration")).toBe(1);
        expect(view.mark.getRenderingRevision("resources")).toBe(0);

        view.paramRuntime.setValue("headWidth", 3);
        expect(view.mark.getRenderingRevision("configuration")).toBe(1);
        expect(view.mark.getRenderingRevision("resources")).toBe(1);
    });

    test("tracks selection predicates as resource revisions", async () => {
        const view = await create(
            {
                data: { values: [{ category: "A", value: 1 }] },
                params: [{ name: "selected", select: "point" }],
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    fillOpacity: {
                        value: 0.3,
                        condition: { param: "selected", value: 1 },
                    },
                },
            },
            UnitView
        );
        const requestRender = vi.spyOn(view.context.animator, "requestRender");

        view.mark.initializeEncoders();
        view.mark.initializeRenderingRevisions([]);
        expect(view.mark.getRenderingRevision("resources")).toBe(0);

        const selection = view.paramRuntime.getValue("selected");
        view.paramRuntime.setValue("selected", { ...selection });

        expect(view.mark.getRenderingRevision("resources")).toBe(1);
        expect(requestRender).toHaveBeenCalledOnce();
    });

    test("deduplicates scale dependencies", async () => {
        const view = await create(
            {
                data: { values: [{ start: 8, end: 32 }] },
                mark: "rule",
                encoding: {
                    x: { field: "start", type: "quantitative" },
                    x2: { field: "end" },
                    y: { value: 0.5 },
                },
            },
            UnitView
        );
        const resolution = view.getScaleResolution("x");
        const addEventListener = vi.spyOn(resolution, "addEventListener");

        view.mark.initializeEncoders();
        view.mark.initializeRenderingRevisions([]);

        const listeners = addEventListener.mock.calls.map((call) => call[1]);
        expect(addEventListener.mock.calls.map((call) => call[0])).toEqual([
            "domain",
            "range",
        ]);
        listeners[0]({ type: "domain", scaleResolution: resolution });
        listeners[1]({ type: "range", scaleResolution: resolution });
        expect(view.mark.getRenderingRevision("resources")).toBe(2);
    });
});

describe("mark positional endpoints", () => {
    test("rejects a visual y value with a scale-backed y2 endpoint", async () => {
        await expect(
            create(
                {
                    data: { values: [{ pos: 1, count: 3 }] },
                    mark: "rule",
                    encoding: {
                        x: { field: "pos", type: "quantitative" },
                        y: { value: 0 },
                        y2: { field: "count", type: "quantitative" },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            /Cannot combine encoding\.y\.value with scale-backed encoding\.y2.*encoding\.y\.datum/
        );
    });

    test("rejects a visual x value with a scale-backed x2 endpoint", async () => {
        await expect(
            create(
                {
                    data: { values: [{ pos: 1, count: 3 }] },
                    mark: "rule",
                    encoding: {
                        x: { value: 0 },
                        x2: { field: "pos", type: "quantitative" },
                        y: { field: "count", type: "quantitative" },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            /Cannot combine encoding\.x\.value with scale-backed encoding\.x2.*encoding\.x\.datum/
        );
    });

    test("allows a scaled primary endpoint with a visual secondary endpoint", async () => {
        const view = await create(
            {
                data: { values: [{ pos: 1, count: 3 }] },
                mark: "rule",
                encoding: {
                    x: { field: "pos", type: "quantitative" },
                    y: { field: "count", type: "quantitative" },
                    y2: { value: 0 },
                },
            },
            UnitView
        );

        expect(() => view.mark.encoding).not.toThrow();
    });
});

describe("mark positional offsets", () => {
    test("inherits the primary offset for an implicit secondary endpoint", async () => {
        const view = await create(
            {
                data: { values: [{ category: "A", value: 3 }] },
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    xOffset: {
                        field: "category",
                        type: "nominal",
                        scale: { range: [-6, 6] },
                    },
                },
            },
            UnitView
        );

        const encoding = /** @type {Record<string, any>} */ (
            view.mark.encoding
        );
        expect(encoding.x2Offset).toEqual({
            ...encoding.xOffset,
            band: 1,
            resolutionChannel: "xOffset",
        });
    });

    test("defaults the secondary offset to zero for an explicit endpoint", async () => {
        const view = await create(
            {
                data: { values: [{ start: 1, end: 2 }] },
                mark: "rule",
                encoding: {
                    x: { field: "start", type: "quantitative" },
                    x2: { field: "end" },
                    xOffset: { value: 7 },
                },
            },
            UnitView
        );

        const encoding = /** @type {Record<string, any>} */ (
            view.mark.encoding
        );
        expect(encoding.x2Offset).toEqual({ value: 0 });
    });

    test("honors an explicit zero secondary offset property", async () => {
        const view = await create(
            {
                data: { values: [{ category: "A", value: 3 }] },
                mark: { type: "rect", xOffset: 8, x2Offset: 0 },
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                },
            },
            UnitView
        );

        const encoding = /** @type {Record<string, any>} */ (
            view.mark.encoding
        );
        expect(encoding.xOffset).toEqual({ value: 8 });
        expect(encoding.x2Offset).toEqual({ value: 0 });
    });

    test.each([
        ["dx", "xOffset"],
        ["dy", "yOffset"],
    ])("rejects legacy point %s with %s", async (legacy, offset) => {
        await expect(
            create(
                {
                    mark: { type: "point", [offset]: 2 },
                    encoding: {
                        [legacy]: { value: 3 },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            `Point marks cannot combine legacy ${legacy} with ${offset}`
        );
    });

    test("allows legacy and new offsets on different axes", async () => {
        const view = await create(
            {
                mark: { type: "point", yOffset: 2 },
                encoding: {
                    dx: { value: 3 },
                },
            },
            UnitView
        );

        expect(view.mark.encoding).toMatchObject({
            dx: { value: 3 },
            yOffset: { value: 2 },
        });
    });
});

describe("offset-aware x indexing", () => {
    /**
     * @param {import("../types/encoder.js").Encoder} xOffset
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
