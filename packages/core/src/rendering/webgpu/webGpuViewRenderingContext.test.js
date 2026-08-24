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
import PlacementSource from "../../view/layout/placementSource.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("WebGpuViewRenderingContext", () => {
    test("runs live view and opacity state from a retained plan", () => {
        let opacity = 0;
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            drawMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext({
            surface: /** @type {any} */ (surface),
        });
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            properties: {},
            unitView: {
                getEffectiveOpacity: () => opacity,
            },
        };

        context.pushView(/** @type {any} */ (view), Rectangle.ZERO);
        context.renderMark(/** @type {any} */ (mark), {});
        context.popView(/** @type {any} */ (view));
        context.finish();

        expect(view.onBeforeRender).not.toHaveBeenCalled();
        context.render({ picking: false });
        expect(view.onBeforeRender).toHaveBeenCalledOnce();
        expect(surface.drawMark).not.toHaveBeenCalled();

        opacity = 1;
        context.render({ picking: false });
        expect(view.onBeforeRender).toHaveBeenCalledTimes(2);
        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(surface.drawMark).toHaveBeenCalledOnce();
    });

    test("translates directional Core clips to a canvas-relative scissor", () => {
        const surface = {
            getDevicePixelRatio: () => 2,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateMark: vi.fn(),
            drawMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext({
            surface: /** @type {any} */ (surface),
        });
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
        context.render({ picking: false });

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

        expect(surface.updateMark).toHaveBeenCalledWith(mark, {}, {});
        expect(surface.drawMark).toHaveBeenCalledWith(mark, {
            firstInstance: 0,
            instanceCount: 1,
            picking: false,
            scissor: { x: 20, y: 40, width: 100, height: 50 },
        });
    });

    test("passes anchor-culling bounds without enabling a scissor", () => {
        const surface = {
            getDevicePixelRatio: () => 2,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateMark: vi.fn(),
            drawMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext({
            surface: /** @type {any} */ (surface),
        });
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
        context.render({ picking: false });

        expect(surface.updateMark).toHaveBeenCalledWith(mark, {}, {});
        expect(surface.drawMark).toHaveBeenCalledWith(mark, {
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
        });
    });

    test("omits non-picking marks from the pick draw list", () => {
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            drawMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext({
            surface: /** @type {any} */ (surface),
        });
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            isPickingParticipant: () => false,
            properties: {},
            unitView: { getEffectiveOpacity: () => 1 },
        };

        context.pushView(/** @type {any} */ (view), Rectangle.ZERO);
        context.renderMark(/** @type {any} */ (mark), {});
        context.popView(/** @type {any} */ (view));
        context.finish();
        context.render({ picking: true });

        expect(surface.updateMark).not.toHaveBeenCalled();
        expect(surface.drawMark).not.toHaveBeenCalled();
    });

    test("submits repeated occurrences in order through one packed mark", () => {
        const placementSource = {
            getSnapshot: () => ({
                topology: { revision: 1 },
                rectangles: new Float32Array([
                    10.5 / 300,
                    20.5 / 200,
                    80 / 300,
                    1 / 200,
                    160.5 / 300,
                    120.5 / 200,
                    100 / 300,
                    50 / 200,
                ]),
            }),
        };
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateOccurrencePlacements: vi.fn(() => placementSource),
            updateMark: vi.fn(),
            drawMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext({
            surface: /** @type {any} */ (surface),
        });
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
        context.render({ picking: false });
        context.render({ picking: false });

        expect(mocks.createWebGpuMarkConfig).toHaveBeenCalledTimes(2);
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
        expect(surface.updateOccurrencePlacements).toHaveBeenCalledOnce();
        expect(surface.updateMark).toHaveBeenCalledTimes(2);
        expect(
            surface.drawMark.mock.calls.map((call) => call[1].placement.index)
        ).toEqual([0, 1, 0, 1]);
    });

    test("coalesces facet-indexed data into one placement draw", () => {
        const source = new PlacementSource();
        source.replaceTopology(
            [["first"], ["second"]],
            new Float32Array([0, 0, 1, 0.5, 0, 0.5, 1, 0.5])
        );
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateMark: vi.fn(),
            drawMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext({
            surface: /** @type {any} */ (surface),
        });
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            encoders: { facetIndex: vi.fn() },
            properties: {},
            unitView: {
                getEffectiveOpacity: () => 1,
                getCollector: () => ({}),
            },
        };

        context.pushView(
            /** @type {any} */ (view),
            Rectangle.create(20, 30, 100, 80)
        );
        context.renderMark(/** @type {any} */ (mark), {
            placement: {
                source,
                topologyRevision: source.getSnapshot().topology.revision,
            },
        });
        context.popView(/** @type {any} */ (view));
        context.finish();
        context.render({ picking: false });

        const adapterCalls = /** @type {any[][]} */ (
            mocks.createWebGpuMarkConfig.mock.calls
        );
        expect(adapterCalls[0][2]).toMatchObject({
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        });
        expect(adapterCalls[0][5]).toBeUndefined();
        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(surface.drawMark).toHaveBeenCalledOnce();
        expect(surface.drawMark.mock.calls[0][1]).toMatchObject({
            viewport: { x: 20.5, y: 30.5, width: 100, height: 80 },
            placement: { source },
        });
    });

    test("submits only visible ranges from a 2,000-placement source", () => {
        const count = 2_000;
        const rectangles = new Float32Array(count * 4);
        for (let index = 0; index < count; index++) {
            rectangles.set([0, 2 + index, 1, 0.01], index * 4);
        }
        rectangles.set([0, 0, 1, 0], 0);
        rectangles.set([0, 0.99, 1, 0.02], 4);
        rectangles.set([0, -0.01, 1, 0.02], 8);
        const source = new PlacementSource();
        source.replaceTopology(
            Array.from({ length: count }, (_, index) => [index]),
            rectangles
        );
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            drawMark: vi.fn(),
        };
        const context = new WebGpuViewRenderingContext({
            surface: /** @type {any} */ (surface),
        });
        const view = { onBeforeRender: vi.fn() };
        const mark = {
            encoders: {},
            isPickingParticipant: () => true,
            properties: {},
            unitView: {
                getEffectiveOpacity: () => 1,
                getCollector: () => ({}),
            },
        };
        const coords = Rectangle.create(0, 0, 100, 100);

        for (let index = 0; index < count; index++) {
            context.pushView(/** @type {any} */ (view), coords);
            context.renderMark(/** @type {any} */ (mark), {
                placement: { source, index },
            });
            context.popView(/** @type {any} */ (view));
        }
        context.finish();
        context.render({ picking: true });

        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(surface.drawMark).toHaveBeenCalledTimes(2);
        expect(
            surface.drawMark.mock.calls.map((call) => call[1].placement.index)
        ).toEqual([1, 2]);
        expect(
            surface.drawMark.mock.calls.every((call) => call[1].picking)
        ).toBe(true);
    });
});
