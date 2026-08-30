import { afterEach, describe, expect, test, vi } from "vitest";
import { startPerformanceProfiler } from "../../debug/performanceProfiler.js";

const mocks = vi.hoisted(() => ({
    renderCanvas2D: vi.fn(),
}));

vi.mock("./renderCanvas2D.js", () => ({
    default: mocks.renderCanvas2D,
}));

import Canvas2DRenderCoordinator from "./canvas2DRenderCoordinator.js";
import SoftwarePickingBuffer from "./picking/softwarePickingBuffer.js";

afterEach(() => {
    const globalObject = /** @type {Record<symbol, unknown>} */ (globalThis);
    delete globalObject[Symbol.for("genome-spy.performance-profiler")];
});

describe("Canvas2DRenderCoordinator", () => {
    test("publishes only the settled layout and replays it without arranging", () => {
        let size = { width: 100, height: 50 };
        let invalidations = 0;
        /** @type {{width: number, devicePixelRatio: number}[]} */
        const arrangements = [];
        const viewRoot = {
            /**
             * @param {import("../../view/renderingContext/viewRenderingContext.js").default} context
             * @param {import("../../view/layout/rectangle.js").default} coords
             */
            arrange(context, coords) {
                arrangements.push({
                    width: coords.width,
                    devicePixelRatio: context.getDevicePixelRatio(),
                });
            },
        };
        const surface = {
            invalidateSize() {
                invalidations++;
                if (invalidations == 2) {
                    size = { width: 200, height: 50 };
                    return true;
                }
                return false;
            },
            getLogicalCanvasSize: () => size,
            getDevicePixelRatio: () => 2,
        };
        const onLayoutComputed = vi.fn();
        const coordinator = new Canvas2DRenderCoordinator({
            viewRoot: /** @type {any} */ (viewRoot),
            context: /** @type {any} */ ({}),
            surface: /** @type {any} */ (surface),
            getBackground: () => "white",
            broadcast: vi.fn(),
            onLayoutComputed,
        });

        coordinator.computeLayout();
        coordinator.renderAll();
        coordinator.renderAll();

        expect(arrangements).toEqual([
            { width: 100, devicePixelRatio: 2 },
            { width: 200, devicePixelRatio: 2 },
        ]);
        expect(onLayoutComputed).toHaveBeenCalledOnce();
        expect(mocks.renderCanvas2D).toHaveBeenCalledTimes(2);
        expect(mocks.renderCanvas2D.mock.calls[0][0].layoutResult).toBe(
            mocks.renderCanvas2D.mock.calls[1][0].layoutResult
        );
    });

    test("replays picking only while dirty and allocates on the first write", () => {
        const profiler = startPerformanceProfiler();
        const buffer = new SoftwarePickingBuffer(20, 10);
        const getPickingBuffer = vi.fn(() => buffer);
        const clearPickingBuffer = vi.fn(() => buffer.clear());
        const collectRenderCommands = vi.fn((context) => {
            context.getRasterizer().fillRect(7, 2, 3, 4, 2);
        });
        const surface = {
            getLogicalCanvasSize: () => ({ width: 20, height: 10 }),
            getDevicePixelRatio: () => 1,
            getPickingBuffer,
            clearPickingBuffer,
        };
        const coordinator = new Canvas2DRenderCoordinator({
            viewRoot: /** @type {any} */ ({}),
            context: /** @type {any} */ ({}),
            surface: /** @type {any} */ (surface),
            getBackground: () => "white",
            broadcast: vi.fn(),
            onLayoutComputed: vi.fn(),
        });
        coordinator.layoutResult = /** @type {any} */ ({
            collectRenderCommands,
        });

        coordinator.renderPickingFramebuffer();
        coordinator.renderPickingFramebuffer();

        expect(getPickingBuffer).toHaveBeenCalledOnce();
        expect(clearPickingBuffer).toHaveBeenCalledOnce();
        expect(collectRenderCommands).toHaveBeenCalledOnce();
        expect(buffer.read(3, 4)).toBe(7);
        expect(profiler.snapshot()).toMatchObject({
            frames: [{ renderer: "canvas", kind: "picking" }],
            countTotals: { pickingRectangles: 1, pickingSpans: 2 },
        });

        coordinator.renderAll();
        coordinator.renderPickingFramebuffer();
        expect(collectRenderCommands).toHaveBeenCalledTimes(2);
    });

    test("profiles normal paints and closes failed frames", () => {
        const profiler = startPerformanceProfiler();
        const coordinator = new Canvas2DRenderCoordinator({
            viewRoot: /** @type {any} */ ({}),
            context: /** @type {any} */ ({}),
            surface: /** @type {any} */ ({
                getLogicalCanvasSize: () => ({ width: 20, height: 10 }),
                getDevicePixelRatio: () => 1,
            }),
            getBackground: () => "white",
            broadcast: vi.fn(),
            onLayoutComputed: vi.fn(),
        });
        coordinator.layoutResult = /** @type {any} */ ({});

        coordinator.renderAll();
        mocks.renderCanvas2D.mockImplementationOnce(() => {
            throw new Error("paint failed");
        });
        expect(() => coordinator.renderAll()).toThrow("paint failed");

        const snapshot = profiler.snapshot();
        expect(snapshot.frames).toMatchObject([
            { renderer: "canvas", kind: "render" },
            { renderer: "canvas", kind: "render" },
        ]);
        expect(snapshot.phaseTotals.render).toBeGreaterThanOrEqual(0);
    });

    test("does not allocate a picking surface for an empty replay", () => {
        const getPickingBuffer = vi.fn();
        const coordinator = new Canvas2DRenderCoordinator({
            viewRoot: /** @type {any} */ ({}),
            context: /** @type {any} */ ({}),
            surface: /** @type {any} */ ({
                getLogicalCanvasSize: () => ({ width: 20, height: 10 }),
                getDevicePixelRatio: () => 1,
                getPickingBuffer,
                clearPickingBuffer: vi.fn(),
            }),
            getBackground: () => null,
            broadcast: vi.fn(),
            onLayoutComputed: vi.fn(),
        });
        coordinator.layoutResult = /** @type {any} */ ({
            collectRenderCommands: vi.fn(),
        });

        coordinator.renderPickingFramebuffer();

        expect(getPickingBuffer).not.toHaveBeenCalled();
    });

    test("refreshes picking before creating a one-shot visualization", () => {
        const buffer = new SoftwarePickingBuffer(20, 10);
        const visualization = /** @type {HTMLCanvasElement} */ ({});
        const createPickingBufferVisualization = vi.fn(() => visualization);
        const collectRenderCommands = vi.fn((context) => {
            context.getRasterizer().fillRect(5, 0, 0, 2, 2);
        });
        const coordinator = new Canvas2DRenderCoordinator({
            viewRoot: /** @type {any} */ ({}),
            context: /** @type {any} */ ({}),
            surface: /** @type {any} */ ({
                getLogicalCanvasSize: () => ({ width: 20, height: 10 }),
                getDevicePixelRatio: () => 1,
                getPickingBuffer: () => buffer,
                clearPickingBuffer: () => buffer.clear(),
                createPickingBufferVisualization,
            }),
            getBackground: () => "white",
            broadcast: vi.fn(),
            onLayoutComputed: vi.fn(),
        });
        coordinator.layoutResult = /** @type {any} */ ({
            collectRenderCommands,
        });
        coordinator.renderPickingFramebuffer();
        collectRenderCommands.mockClear();
        const result = coordinator.createPickingBufferVisualization();

        expect(result).toBe(visualization);
        expect(collectRenderCommands).toHaveBeenCalledOnce();
        expect(createPickingBufferVisualization).toHaveBeenCalledOnce();
    });
});
