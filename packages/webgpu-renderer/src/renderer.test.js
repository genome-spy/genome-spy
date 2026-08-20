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
});

function createRendererHarness() {
    const renderer = Object.create(Renderer.prototype);
    renderer._marks = new Map();
    renderer._nextMarkId = 1;
    renderer._pickingDirty = false;
    renderer._renderFrame = null;
    renderer._globals = { width: 100, height: 50, dpr: 2 };
    renderer._globalUniformStride = 256;
    renderer._globalUniformCapacity = 4;
    renderer._globalUniformBuffer = {};
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
    };
    renderer.context = {
        getCurrentTexture: () => ({ createView: vi.fn() }),
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
