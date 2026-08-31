import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const packed = /** @type {any} */ ({ data: [{}] });
    return {
        packed,
        createWebGpuMarkConfig: vi.fn(() => ({
            definition: {},
            config: {},
        })),
        getWebGpuMarkConfigRevision: vi.fn(() => 0),
        getWebGpuMarkResourceRevision: vi.fn(() => 0),
        getPackedMarkData: vi.fn(() => packed),
        getPackedMarkRange: /** @type {any} */ (
            vi.fn(() => ({
                firstInstance: 0,
                instanceCount: 1,
            }))
        ),
        resolveMarkXIndexQuery: vi.fn((spec, target) => {
            if (!spec) {
                return false;
            }
            target[0] = spec.domain[0];
            target[1] = spec.domain[1];
            return true;
        }),
    };
});

vi.mock("./webGpuMarkAdapter.js", () => ({
    createWebGpuMarkConfig: mocks.createWebGpuMarkConfig,
    getWebGpuMarkConfigRevision: mocks.getWebGpuMarkConfigRevision,
    getWebGpuMarkResourceRevision: mocks.getWebGpuMarkResourceRevision,
}));

vi.mock("./webGpuMarkData.js", () => ({
    getPackedMarkData: mocks.getPackedMarkData,
    getPackedMarkRange: mocks.getPackedMarkRange,
}));

vi.mock("../xIndex/markXIndex.js", () => ({
    resolveMarkXIndexQuery: mocks.resolveMarkXIndexQuery,
}));

import Rectangle from "../../view/layout/rectangle.js";
import PlacementSource from "../../view/layout/placementSource.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

/**
 * @param {any} surface
 * @param {{markPredicate?: (mark: import("../../marks/mark.js").default) => boolean}} [options]
 */
function createContext(surface, options = {}) {
    const { width, height } = surface.getLogicalCanvasSize();
    return new WebGpuViewRenderingContext({
        surface,
        target: {
            width,
            height,
            dpr: surface.getDevicePixelRatio(),
        },
        ...options,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPackedMarkData.mockReturnValue(mocks.packed);
    mocks.getPackedMarkRange.mockReturnValue({
        firstInstance: 0,
        instanceCount: 1,
    });
    mocks.getWebGpuMarkConfigRevision.mockReturnValue(0);
    mocks.getWebGpuMarkResourceRevision.mockReturnValue(0);
    delete mocks.packed.xIndexSpec;
});

describe("WebGpuViewRenderingContext", () => {
    test("requests MSAA for an un-faceted plain rectangle", () => {
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            encoders: {},
            encoding: {},
            getType: () => "rect",
            properties: {},
            unitView: { getEffectiveOpacity: () => 1 },
        };

        context.pushView(/** @type {any} */ (view), Rectangle.ZERO);
        context.renderMark(/** @type {any} */ (mark), {});
        context.popView(/** @type {any} */ (view));
        context.finish();
        const frame = context.render({ picking: false });

        expect(frame.items[0]).toMatchObject({
            sampleCount: 4,
            items: [surface.prepareDraw.mock.calls[0][1]],
        });
    });

    test("compiles only marks selected for a raster run", () => {
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const selected = {
            encoders: {},
            encoding: {},
            getType: () => "point",
            isPickingParticipant: () => true,
            properties: {},
            unitView: { getEffectiveOpacity: () => 1 },
        };
        const other = { ...selected };
        const context = createContext(surface, {
            markPredicate: (mark) => mark === selected,
        });

        context.pushView(/** @type {any} */ (view), Rectangle.ZERO);
        context.renderMark(/** @type {any} */ (selected), {});
        context.renderMark(/** @type {any} */ (other), {});
        context.popView(/** @type {any} */ (view));
        context.finish();
        context.render({ picking: false });

        expect(mocks.getPackedMarkData).toHaveBeenCalledOnce();
        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(surface.prepareDraw).toHaveBeenCalledOnce();
        expect(surface.prepareDraw.mock.calls[0][0]).toBe(selected);
    });

    test("refreshes visible and picking ranges without mark uploads", () => {
        const domain = [20, 30];
        mocks.packed.xIndexSpec = { domain };
        const xIndex = vi.fn((start, end, target) => {
            target[0] = start + 100;
            target[1] = end + 100;
        });
        mocks.getPackedMarkRange.mockReturnValue({
            firstInstance: 100,
            instanceCount: 100,
            xIndex,
        });
        const drawRanges = /** @type {[number, number][]} */ ([]);
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn((_mark, draw) => {
                drawRanges.push([draw.firstInstance, draw.instanceCount]);
            }),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            encoders: {},
            getType: () => "point",
            isPickingParticipant: () => true,
            properties: {},
            unitView: { getEffectiveOpacity: () => 1 },
        };

        context.pushView(/** @type {any} */ (view), Rectangle.ZERO);
        context.renderMark(/** @type {any} */ (mark), {});
        context.popView(/** @type {any} */ (view));
        context.finish();
        context.render({ picking: false });

        domain[0] = 40;
        domain[1] = 45;
        context.render({ picking: false });
        context.render({ picking: true });

        expect(mocks.createWebGpuMarkConfig).toHaveBeenCalledOnce();
        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(surface.prepareDraw).toHaveBeenCalledTimes(3);
        expect(drawRanges).toEqual([
            [120, 10],
            [140, 5],
            [140, 5],
        ]);
        expect(xIndex).toHaveBeenCalledTimes(3);
    });

    test("runs live view and opacity state from a retained plan", () => {
        let opacity = 0;
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            getType: () => "point",
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
        expect(surface.prepareDraw).not.toHaveBeenCalled();

        opacity = 1;
        context.render({ picking: false });
        expect(view.onBeforeRender).toHaveBeenCalledTimes(2);
        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(surface.prepareDraw).toHaveBeenCalledOnce();
    });

    test("translates directional Core clips to a canvas-relative scissor", () => {
        const surface = {
            getDevicePixelRatio: () => 2,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            getType: () => "point",
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
        expect(adapterCalls[0][3]).toBe(1);

        expect(surface.updateMark).toHaveBeenCalledWith(mark, {}, {}, {});
        expect(surface.prepareDraw).toHaveBeenCalledWith(
            mark,
            expect.objectContaining({
                firstInstance: 0,
                instanceCount: 1,
                scissor: { x: 20, y: 40, width: 100, height: 50 },
            }),
            undefined
        );
    });

    test("passes anchor-culling bounds without enabling a scissor", () => {
        const surface = {
            getDevicePixelRatio: () => 2,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            getType: () => "point",
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

        expect(surface.updateMark).toHaveBeenCalledWith(mark, {}, {}, {});
        expect(surface.prepareDraw).toHaveBeenCalledWith(
            mark,
            expect.objectContaining({
                firstInstance: 0,
                instanceCount: 1,
                visibleRange: {
                    x1: 0,
                    y1: 40,
                    x2: 120,
                    y2: 90,
                    cullX: false,
                    cullY: true,
                },
            }),
            undefined
        );
    });

    test("refreshes closure-backed geometry through stable draw records", () => {
        let offset = 0;
        /** @type {{x: number, height: number}[]} */
        const configGeometry = [];
        /**
         * @param {any} _mark
         * @param {any} _options
         * @param {{x: number, height: number}} coords
         */
        const captureConfigGeometry = (_mark, _options, coords) => {
            configGeometry.push({ x: coords.x, height: coords.height });
            return { definition: {}, config: {} };
        };
        /** @type {any} */ (mocks.createWebGpuMarkConfig)
            .mockImplementationOnce(captureConfigGeometry)
            .mockImplementationOnce(captureConfigGeometry);
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = {
            onBeforeRender: () => (offset += 10),
            getOpacity: () => 1,
        };
        const coords = Rectangle.create(20, 30, 100, 80)
            .modify({ height: () => 80 + offset })
            .translate(() => offset, 0);
        const mark = {
            getType: () => "point",
            isPickingParticipant: () => true,
            properties: { clip: true, cullByVisibleRange: "x" },
            unitView: { getEffectiveOpacity: () => 1 },
        };

        context.pushView(/** @type {any} */ (view), coords);
        context.renderMark(/** @type {any} */ (mark), {});
        context.popView(/** @type {any} */ (view));
        context.finish();

        context.render({ picking: false });
        const firstDraw = surface.prepareDraw.mock.calls[0][1];
        expect(firstDraw.scissor).toEqual({
            x: 30,
            y: 30,
            width: 100,
            height: 90,
        });
        expect(firstDraw.visibleRange).toMatchObject({ x1: 30, x2: 130 });

        const pickingFrame = context.render({ picking: true });
        const secondDraw = surface.prepareDraw.mock.calls[1][1];
        expect(secondDraw).toBe(firstDraw);
        expect(pickingFrame.pickingDraws).toEqual([secondDraw]);
        expect(secondDraw.scissor).toEqual({
            x: 40,
            y: 30,
            width: 100,
            height: 100,
        });
        expect(secondDraw.visibleRange).toMatchObject({ x1: 40, x2: 140 });

        // Unlike the draw envelope, positional mark channels bake the owner
        // rectangle into the retained config and must be refreshed as well.
        expect(mocks.createWebGpuMarkConfig).toHaveBeenCalledTimes(2);
        expect(surface.updateMark).toHaveBeenCalledTimes(2);
        expect(configGeometry).toEqual([
            { x: 30.5, height: 90 },
            { x: 40.5, height: 100 },
        ]);
    });

    test("omits non-picking marks from the pick draw list", () => {
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            getType: () => "point",
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
        expect(surface.prepareDraw).not.toHaveBeenCalled();
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
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            getType: () => "point",
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
        expect(surface.updateOccurrencePlacements).toHaveBeenCalledTimes(3);
        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(mocks.getPackedMarkRange).toHaveBeenCalledTimes(2);
        expect(surface.prepareDraw.mock.calls[0][1]).toBe(
            surface.prepareDraw.mock.calls[2][1]
        );
        expect(surface.prepareDraw.mock.calls[1][1]).toBe(
            surface.prepareDraw.mock.calls[3][1]
        );
        expect(
            surface.prepareDraw.mock.calls.map(
                (call) => call[1].placement.index
            )
        ).toEqual([0, 1, 0, 1]);

        mocks.getPackedMarkData.mockReturnValue({ data: [{ updated: true }] });
        context.render({ picking: false });
        expect(mocks.createWebGpuMarkConfig).toHaveBeenCalledTimes(2);
        expect(surface.updateMark).toHaveBeenCalledTimes(2);
        expect(mocks.getPackedMarkRange).toHaveBeenCalledTimes(4);

        mocks.getWebGpuMarkConfigRevision.mockReturnValue(1);
        context.render({ picking: false });
        expect(mocks.createWebGpuMarkConfig).toHaveBeenCalledTimes(3);
        expect(surface.updateMark).toHaveBeenCalledTimes(3);
        expect(mocks.getPackedMarkRange).toHaveBeenCalledTimes(4);

        mocks.getWebGpuMarkResourceRevision.mockReturnValue(1);
        context.render({ picking: false });
        expect(mocks.createWebGpuMarkConfig).toHaveBeenCalledTimes(3);
        expect(surface.updateMark).toHaveBeenCalledTimes(4);
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
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            encoders: { facetIndex: vi.fn() },
            encoding: {},
            getType: () => "rect",
            properties: {},
            unitView: {
                getEffectiveOpacity: () => 1,
                getCollector: () => ({}),
                getPathString: () => "samples/copy-ratios",
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
        const frame = context.render({ picking: false });

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
        expect(surface.prepareDraw).toHaveBeenCalledOnce();
        expect(surface.prepareDraw.mock.calls[0][1]).toMatchObject({
            viewport: { x: 20.5, y: 30.5, width: 100, height: 80 },
            placement: { set: { placementSetId: -1 } },
        });
        expect(surface.prepareDraw.mock.calls[0][2]).toBe(source);
        expect(frame.items[0]).toMatchObject({
            sampleCount: 4,
            items: [surface.prepareDraw.mock.calls[0][1]],
        });
    });

    test("preserves repeated sample rectangle ranges for one MSAA group", () => {
        const source = new PlacementSource();
        source.replaceTopology(
            [["first"], ["second"]],
            new Float32Array([0, 0, 1, 0.5, 0, 0.5, 1, 0.5])
        );
        const xIndex = vi.fn();
        mocks.getPackedMarkData.mockReturnValue({
            data: [{ sample: "first" }, { sample: "second" }],
            xIndexSpec: { domain: [0, 2] },
        });
        mocks.getPackedMarkRange.mockImplementation(
            (/** @type {any} */ _mark, /** @type {any} */ options) => {
                const index = options.placement.index;
                return {
                    firstInstance: index,
                    instanceCount: 1,
                    xIndex: (
                        /** @type {number} */ start,
                        /** @type {number} */ end,
                        /** @type {[number, number]} */ target
                    ) => {
                        xIndex(start, end, target);
                        target[0] = index;
                        target[1] = index + 1;
                    },
                };
            }
        );
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 300, height: 200 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            encoders: { sample: vi.fn() },
            encoding: {},
            getType: () => "rect",
            properties: {},
            unitView: {
                getEffectiveOpacity: () => 1,
                getCollector: () => ({}),
                getPathString: () => "samples/copy-ratios",
            },
        };
        const coords = Rectangle.create(20, 30, 100, 80);

        for (let index = 0; index < 2; index++) {
            context.pushView(/** @type {any} */ (view), coords);
            context.renderMark(/** @type {any} */ (mark), {
                clip: {
                    rect: Rectangle.create(20 + index * 50, 30, 50, 80),
                    clipX: true,
                    clipY: true,
                },
                placement: {
                    source,
                    index,
                    topologyRevision: source.getSnapshot().topology.revision,
                },
            });
            context.popView(/** @type {any} */ (view));
        }
        context.finish();
        const frame = context.render({ picking: false });

        const adapterCalls = /** @type {any[][]} */ (
            mocks.createWebGpuMarkConfig.mock.calls
        );
        expect(adapterCalls[0][5]).toEqual({ source: "draw" });
        expect(surface.prepareDraw).toHaveBeenCalledTimes(2);
        expect(
            surface.prepareDraw.mock.calls.map((call) => ({
                firstInstance: call[1].firstInstance,
                instanceCount: call[1].instanceCount,
                placementIndex: call[1].placement.index,
                scissor: call[1].scissor,
            }))
        ).toEqual([
            {
                firstInstance: 0,
                instanceCount: 1,
                placementIndex: 0,
                scissor: { x: 20, y: 30, width: 50, height: 80 },
            },
            {
                firstInstance: 1,
                instanceCount: 1,
                placementIndex: 1,
                scissor: { x: 70, y: 30, width: 50, height: 80 },
            },
        ]);
        expect(frame.items[0]).toMatchObject({
            sampleCount: 4,
            items: surface.prepareDraw.mock.calls.map((call) => call[1]),
        });
        expect(xIndex).toHaveBeenCalledTimes(2);
    });

    test("keeps repeated MSAA occurrences in paint order", () => {
        const source = new PlacementSource();
        source.replaceTopology(
            [["first"], ["second"]],
            new Float32Array([0, 0, 0.5, 1, 0.5, 0, 0.5, 1])
        );
        /** @type {string[]} */
        const order = [];
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn((mark) => order.push(mark.name)),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const rectangle = {
            name: "rect A",
            encoders: {},
            encoding: {},
            getType: () => "rect",
            properties: {},
            unitView: { getEffectiveOpacity: () => 1 },
        };
        const point = {
            name: "mark B",
            getType: () => "point",
            properties: {},
            unitView: { getEffectiveOpacity: () => 1 },
        };
        /** @param {number} index */
        const placement = (index) => ({
            source,
            index,
            topologyRevision: source.getSnapshot().topology.revision,
        });

        context.pushView(
            /** @type {any} */ (view),
            Rectangle.create(0, 0, 100, 100)
        );
        context.renderMark(/** @type {any} */ (rectangle), {
            placement: placement(0),
        });
        context.renderMark(/** @type {any} */ (point), {});
        context.renderMark(/** @type {any} */ (rectangle), {
            placement: placement(1),
        });
        context.popView(/** @type {any} */ (view));
        context.finish();
        context.render({ picking: false });

        expect(order).toEqual(["rect A", "mark B", "rect A"]);
    });

    test("keeps repeated MSAA occurrences in their opacity scopes", () => {
        const source = new PlacementSource();
        source.replaceTopology(
            [["first"], ["second"]],
            new Float32Array([0, 0, 0.5, 1, 0.5, 0, 0.5, 1])
        );
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const firstView = {
            name: "first",
            onBeforeRender: vi.fn(),
            getOpacity: () => 0.5,
            visit: (/** @type {(view: any) => void} */ visitor) =>
                visitor({ mark }),
        };
        const secondView = {
            name: "second",
            onBeforeRender: vi.fn(),
            getOpacity: () => 0.75,
            visit: (/** @type {(view: any) => void} */ visitor) =>
                visitor({ mark }),
        };
        const mark = {
            encoders: {},
            encoding: {},
            getType: () => "rect",
            properties: {},
            unitView: { getEffectiveOpacity: () => 1 },
        };

        for (const [view, index] of /** @type {[any, number][]} */ ([
            [firstView, 0],
            [secondView, 1],
        ])) {
            context.pushView(
                /** @type {any} */ (view),
                Rectangle.create(0, 0, 100, 100)
            );
            context.renderMark(/** @type {any} */ (mark), {
                placement: {
                    source,
                    index,
                    topologyRevision: source.getSnapshot().topology.revision,
                },
            });
            context.popView(/** @type {any} */ (view));
        }
        context.finish();
        const frame = context.render({ picking: false });

        expect(frame.items).toMatchObject([
            {
                opacity: 0.5,
                items: [
                    { sampleCount: 4, items: [{ placement: { index: 0 } }] },
                ],
            },
            {
                opacity: 0.75,
                items: [
                    { sampleCount: 4, items: [{ placement: { index: 1 } }] },
                ],
            },
        ]);
    });

    test("updates local group opacity without rebuilding mark resources", () => {
        let opacity = 0.5;
        const surface = {
            getDevicePixelRatio: () => 1,
            getLogicalCanvasSize: () => ({ width: 100, height: 100 }),
            updateMark: vi.fn(),
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = {
            onBeforeRender: vi.fn(),
            getOpacity: () => opacity,
            getEffectiveOpacity: () => opacity,
            getCollector: () => ({}),
            visit: (/** @type {(view: any) => void} */ visitor) =>
                visitor({ mark }),
        };
        const mark = {
            encoders: {},
            getType: () => "point",
            properties: {},
            unitView: view,
        };
        const coords = Rectangle.create(10, 20, 30, 40);

        context.pushView(/** @type {any} */ (view), coords);
        context.renderMark(/** @type {any} */ (mark), {});
        context.popView(/** @type {any} */ (view));
        context.finish();
        const firstFrame = context.render({ picking: false });
        opacity = 0.25;
        const secondFrame = context.render({ picking: false });

        expect(firstFrame.items[0]).toMatchObject({ opacity: 0.5 });
        expect(secondFrame.items[0]).toMatchObject({ opacity: 0.25 });
        expect(surface.updateMark).toHaveBeenCalledOnce();
        const adapterCalls = /** @type {any[][]} */ (
            mocks.createWebGpuMarkConfig.mock.calls
        );
        expect(adapterCalls[0][3]).toBe(1);
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
            prepareDraw: vi.fn(),
        };
        const context = createContext(surface);
        const view = { onBeforeRender: vi.fn(), getOpacity: () => 1 };
        const mark = {
            encoders: {},
            getType: () => "point",
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
        const frame = context.render({ picking: true });

        expect(surface.updateMark).toHaveBeenCalledOnce();
        expect(surface.prepareDraw).toHaveBeenCalledTimes(2);
        expect(
            surface.prepareDraw.mock.calls.map(
                (call) => call[1].placement.index
            )
        ).toEqual([1, 2]);
        expect(frame.pickingDraws).toHaveLength(2);
    });
});
