import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createWebGpuMarkConfig: vi.fn(() => ({
        definition: {},
        config: {},
    })),
}));

vi.mock("./webGpuMarkAdapter.js", () => ({
    createWebGpuMarkConfig: mocks.createWebGpuMarkConfig,
}));

import Rectangle from "../../view/layout/rectangle.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

describe("WebGpuViewRenderingContext", () => {
    test("translates directional Core clips to a canvas-relative scissor", () => {
        const surface = {
            getDevicePixelRatio: () => 2,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            useMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext(
            { picking: false },
            { surface: /** @type {any} */ (surface) }
        );
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            properties: { clip: "x" },
            unitView: {
                getEffectiveOpacity: () => 0.25,
            },
        };
        const coords = Rectangle.create(20, 30, 100, 80);

        context.pushView(/** @type {any} */ (view), coords);
        context.renderMark(/** @type {any} */ (mark), {
            clip: {
                rect: Rectangle.create(10, 40, 200, 50),
                clipX: false,
                clipY: true,
            },
        });

        const adapterCalls = /** @type {any[][]} */ (
            mocks.createWebGpuMarkConfig.mock.calls
        );
        const markCoords = adapterCalls[0][2];
        expect([
            markCoords.x,
            markCoords.y,
            markCoords.width,
            markCoords.height,
        ]).toEqual([20.5, 30.5, 100, 80]);
        expect(adapterCalls[0][3]).toBe(0.25);

        expect(surface.useMark).toHaveBeenCalledWith(
            mark,
            {},
            {},
            {
                picking: false,
                scissor: { x: 20, y: 40, width: 100, height: 50 },
            }
        );
    });

    test("passes anchor-culling bounds without enabling a scissor", () => {
        const surface = {
            getDevicePixelRatio: () => 2,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            useMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext(
            { picking: false },
            { surface: /** @type {any} */ (surface) }
        );
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            properties: { clip: "never", cullByVisibleRange: "y" },
            unitView: {
                getEffectiveOpacity: () => 1,
            },
        };
        const coords = Rectangle.create(20, 30, 100, 80);

        context.pushView(/** @type {any} */ (view), coords);
        context.renderMark(/** @type {any} */ (mark), {
            clip: {
                rect: Rectangle.create(10, 40, 200, 50),
                clipX: false,
                clipY: true,
            },
        });

        expect(surface.useMark).toHaveBeenCalledWith(
            mark,
            {},
            {},
            {
                picking: false,
                visibleRange: {
                    x1: 0,
                    y1: 40,
                    x2: 120,
                    y2: 90,
                    cullX: false,
                    cullY: true,
                },
            }
        );
    });

    test("omits non-picking marks from the pick draw list", () => {
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            useMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext(
            { picking: true },
            { surface: /** @type {any} */ (surface) }
        );
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            isPickingParticipant: () => false,
            unitView: { getEffectiveOpacity: () => 1 },
        };

        context.pushView(/** @type {any} */ (view), Rectangle.ZERO);
        context.renderMark(/** @type {any} */ (mark), {});

        expect(surface.useMark).not.toHaveBeenCalled();
    });
});
