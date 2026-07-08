import { describe, expect, test } from "vitest";

import Rectangle from "../view/layout/rectangle.js";
import { createSelfClipOptions } from "../view/renderingContext/clipOptions.js";
import UnitView from "../view/unitView.js";
import { create } from "../view/testUtils.js";
import { createLogicalVisibleRect, createViewportScope } from "./mark.js";

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
