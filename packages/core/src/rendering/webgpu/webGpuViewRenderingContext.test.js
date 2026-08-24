import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createWebGpuMarkConfig: vi.fn(() => ({
        definition: {},
        config: {},
    })),
    getPackedMarkData: vi.fn(() => ({ data: [{}] })),
    getPackedMarkRange: vi.fn(() => ({
        firstInstance: 0,
        instanceCount: 1,
    })),
}));

vi.mock("./webGpuMarkAdapter.js", () => ({
    createWebGpuMarkConfig: mocks.createWebGpuMarkConfig,
    getPackedMarkData: mocks.getPackedMarkData,
    getPackedMarkRange: mocks.getPackedMarkRange,
}));

import Rectangle from "../../view/layout/rectangle.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

beforeEach(() => {
    vi.clearAllMocks();
});

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
        context.popView(/** @type {any} */ (view));
        context.finish();

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
                firstInstance: 0,
                instanceCount: 1,
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
        context.popView(/** @type {any} */ (view));
        context.finish();

        expect(surface.useMark).toHaveBeenCalledWith(
            mark,
            {},
            {},
            {
                firstInstance: 0,
                instanceCount: 1,
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

    test("submits repeated occurrences in order through one packed mark", () => {
        const placementSource = {
            getSnapshot: () => ({ topology: { revision: 1 } }),
        };
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateOccurrencePlacements: vi.fn(() => placementSource),
            useMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext(
            { picking: false },
            { surface: /** @type {any} */ (surface) }
        );
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            properties: {},
            unitView: {
                getEffectiveOpacity: () => 1,
                getCollector: () => ({}),
            },
        };

        for (const coords of [
            Rectangle.create(10, 20, 80, 0),
            Rectangle.create(160, 120, 100, 50),
        ]) {
            context.pushView(/** @type {any} */ (view), coords);
            context.renderMark(/** @type {any} */ (mark), {});
            context.popView(/** @type {any} */ (view));
        }
        context.finish();

        expect(mocks.createWebGpuMarkConfig).toHaveBeenCalledOnce();
        const adapterCalls = /** @type {any[][]} */ (
            mocks.createWebGpuMarkConfig.mock.calls
        );
        expect(adapterCalls[0][2]).toMatchObject({
            x: 0,
            y: 0,
            width: 300,
            height: 200,
        });
        expect(adapterCalls[0][5]).toEqual({
            source: "draw",
        });
        const placementCalls = /** @type {any[][]} */ (
            surface.updateOccurrencePlacements.mock.calls
        );
        const rectangles = placementCalls[0][1];
        expect(rectangles).toEqual(
            new Float32Array([
                10.5 / 300,
                20.5 / 200,
                80 / 300,
                1 / 200,
                160.5 / 300,
                120.5 / 200,
                100 / 300,
                50 / 200,
            ])
        );
        expect(
            surface.useMark.mock.calls.map((call) => call[3].placement.index)
        ).toEqual([0, 1]);
    });
});
