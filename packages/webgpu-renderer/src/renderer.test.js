import { describe, expect, test, vi } from "vitest";

import { Renderer } from "./renderer.js";

describe("Renderer mark definitions", () => {
    test("notifies the host instead of submitting an implicit frame", () => {
        const { renderer } = createRendererHarness();
        const onInvalidate = vi.fn();
        renderer._onInvalidate = onInvalidate;
        renderer._pickingDirty = false;

        renderer._invalidate();

        expect(onInvalidate).toHaveBeenCalledOnce();
        expect(renderer._pickingDirty).toBe(true);
        expect(renderer.device.queue.submit).not.toHaveBeenCalled();
    });

    test("creates a mark through an imported definition", () => {
        const program = createProgram();
        /** @type {import("./index.d.ts").MarkDefinition<{ channels: Record<string, never> }>} */
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const { renderer } = createRendererHarness();
        const config = { channels: {} };

        const handle = renderer.createMark(definition, config);

        expect(definition.createProgram).toHaveBeenCalledWith(renderer, config);
        expect(handle.markId).toBe(1);
        expect(handle.series).toBe(program.getSlotHandles().series);
        expect(handle.scales).toEqual({});
        expect(renderer._marks.get(handle.markId)).toBe(program);
    });

    test("accepts a separate ordered pick draw list", () => {
        const { renderer } = createRendererHarness();

        renderer.renderPicking({ draws: [] });

        expect(renderer._pickingFrame).toEqual([]);
    });

    test("coalesces concurrent pick readbacks to the latest request", async () => {
        const { renderer } = createRendererHarness();
        /** @type {[number, number][]} */
        const calls = [];
        /** @type {() => void} */
        let releaseFirst = () => {};
        const firstReadback = new Promise((resolve) => {
            releaseFirst = () => resolve();
        });
        renderer._pickSingle = vi.fn(async (x, y) => {
            calls.push([x, y]);
            if (calls.length === 1) {
                await firstReadback;
            }
            return x + y;
        });

        const first = renderer.pick(1, 2);
        const second = renderer.pick(3, 4);
        const third = renderer.pick(5, 6);

        await Promise.resolve();
        expect(calls).toEqual([[1, 2]]);
        await expect(second).resolves.toBeNull();

        releaseFirst();

        await expect(Promise.all([first, third])).resolves.toEqual([3, 11]);
        expect(calls).toEqual([
            [1, 2],
            [5, 6],
        ]);
    });

    test("draws retained mark occurrences in the requested order", () => {
        const firstProgram = createProgram();
        const secondProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(firstProgram)
                .mockReturnValueOnce(secondProgram),
        });
        const { renderer, pass } = createRendererHarness();
        const first = renderer.createMark(definition, { channels: {} });
        const second = renderer.createMark(definition, { channels: {} });

        renderer.render({
            draws: [
                {
                    mark: second,
                    viewport: { x: 50, y: 0, width: 50, height: 50 },
                    scissor: { x: 75, y: 0, width: 25, height: 50 },
                    firstInstance: 2,
                    instanceCount: 3,
                },
                { mark: first },
                { mark: second },
            ],
        });

        expect(secondProgram.draw.mock.invocationCallOrder[0]).toBeLessThan(
            firstProgram.draw.mock.invocationCallOrder[0]
        );
        expect(secondProgram.draw).toHaveBeenCalledTimes(2);
        expect(secondProgram.draw).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            { firstInstance: 2, instanceCount: 3 }
        );
        expect(pass.setViewport).toHaveBeenNthCalledWith(
            1,
            100,
            0,
            100,
            100,
            0,
            1
        );
        expect(pass.setScissorRect).toHaveBeenNthCalledWith(1, 150, 0, 50, 100);
        expect(pass.setBindGroup).toHaveBeenNthCalledWith(
            3,
            0,
            renderer._globalBindGroup,
            [512]
        );
        expect(renderer._renderFrame?.map((draw) => draw.markId)).toEqual([
            second.markId,
            first.markId,
            second.markId,
        ]);
    });

    test("clamps physical scissors to the render target", () => {
        const program = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const { renderer, pass } = createRendererHarness();
        renderer.canvas = /** @type {HTMLCanvasElement} */ (
            /** @type {unknown} */ ({ width: 99, height: 100 })
        );
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({
            draws: [{ mark, scissor: { x: 0, y: 0, width: 100, height: 50 } }],
        });

        expect(pass.setScissorRect).toHaveBeenCalledWith(0, 0, 99, 100);
    });

    test("destroys owned resources exactly once and rejects later work", () => {
        const firstProgram = createProgram();
        const secondProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(firstProgram)
                .mockReturnValueOnce(secondProgram),
        });
        const { renderer } = createRendererHarness();
        renderer.createMark(definition, { channels: {} });
        renderer.createMark(definition, { channels: {} });
        const pickTexture =
            /** @type {GPUTexture & { destroy: ReturnType<typeof vi.fn> }} */ (
                /** @type {unknown} */ ({ destroy: vi.fn() })
            );
        const pickReadbackBuffer =
            /** @type {GPUBuffer & { destroy: ReturnType<typeof vi.fn> }} */ (
                /** @type {unknown} */ ({ destroy: vi.fn() })
            );
        renderer._pickTexture = pickTexture;
        renderer._pickReadbackBuffer = pickReadbackBuffer;

        renderer.destroy();
        renderer.destroy();

        expect(firstProgram.destroy).toHaveBeenCalledOnce();
        expect(secondProgram.destroy).toHaveBeenCalledOnce();
        expect(renderer._marks).toHaveLength(0);
        expect(renderer._globalUniformBuffer.destroy).toHaveBeenCalledOnce();
        expect(pickTexture.destroy).toHaveBeenCalledOnce();
        expect(pickReadbackBuffer.destroy).toHaveBeenCalledOnce();
        expect(renderer.context.unconfigure).toHaveBeenCalledOnce();
        expect(renderer.device.destroy).toHaveBeenCalledOnce();
        expect(() => renderer.render()).toThrow("Renderer has been destroyed.");
        expect(() => renderer.createMark(definition, { channels: {} })).toThrow(
            "Renderer has been destroyed."
        );
    });
});

function createRendererHarness() {
    const renderer = Object.create(Renderer.prototype);
    renderer._marks = new Map();
    renderer._nextMarkId = 1;
    renderer._destroyed = false;
    renderer._onInvalidate = vi.fn();
    renderer._pickingDirty = false;
    renderer._pickPending = null;
    renderer._pickInFlight = null;
    renderer._renderFrame = null;
    renderer.canvas = /** @type {HTMLCanvasElement} */ (
        /** @type {unknown} */ ({ width: 200, height: 100 })
    );
    renderer._globals = { width: 100, height: 50, dpr: 2 };
    renderer._globalUniformStride = 256;
    renderer._globalUniformCapacity = 4;
    renderer._globalUniformBuffer = { destroy: vi.fn() };
    renderer._globalBindGroup = {};
    const pass = {
        end: vi.fn(),
        setViewport: vi.fn(),
        setScissorRect: vi.fn(),
        setBindGroup: vi.fn(),
    };
    renderer.device = {
        createCommandEncoder: () => ({
            beginRenderPass: () => pass,
            finish: vi.fn(),
        }),
        queue: { submit: vi.fn(), writeBuffer: vi.fn() },
        destroy: vi.fn(),
    };
    renderer.context = {
        getCurrentTexture: () => ({ createView: vi.fn() }),
        unconfigure: vi.fn(),
    };
    return { renderer: /** @type {Renderer} */ (renderer), pass };
}

function createProgram() {
    const series = { replace: vi.fn() };
    return {
        count: 10,
        getSlotHandles: () => ({
            series,
            scales: {},
            values: {},
            extraValues: {},
            selections: {},
        }),
        replaceSeries: series.replace,
        updateValues: vi.fn(),
        debugResources: vi.fn(),
        draw: vi.fn(),
        drawPick: vi.fn(),
        destroy: vi.fn(),
    };
}
