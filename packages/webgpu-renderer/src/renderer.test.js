import { describe, expect, test, vi } from "vitest";

import { Renderer } from "./renderer.js";

describe("Renderer mark definitions", () => {
    test("creates a mark through an imported definition", () => {
        const program = createProgram();
        /** @type {import("./index.d.ts").MarkDefinition<{ channels: Record<string, never> }>} */
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const renderer = createRendererHarness();
        const config = { channels: {} };

        const handle = renderer.createMark(definition, config);

        expect(definition.createProgram).toHaveBeenCalledWith(renderer, config);
        expect(handle.markId).toBe(1);
        expect(handle.series).toBe(program.getSlotHandles().series);
        expect(handle.scales).toEqual({});
        expect(renderer._marks.get(handle.markId)).toBe(program);
    });

    test("draws retained marks in the requested order", () => {
        const firstProgram = createProgram();
        const secondProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(firstProgram)
                .mockReturnValueOnce(secondProgram),
        });
        const renderer = createRendererHarness();
        const first = renderer.createMark(definition, { channels: {} });
        const second = renderer.createMark(definition, { channels: {} });

        renderer.render([second.markId, first.markId]);

        expect(secondProgram.draw.mock.invocationCallOrder[0]).toBeLessThan(
            firstProgram.draw.mock.invocationCallOrder[0]
        );
        expect(renderer._renderOrder).toEqual([second.markId, first.markId]);
    });
});

function createRendererHarness() {
    const renderer = Object.create(Renderer.prototype);
    renderer._marks = new Map();
    renderer._nextMarkId = 1;
    renderer._pickingDirty = false;
    renderer._renderOrder = null;
    const pass = { end: vi.fn() };
    renderer.device = {
        createCommandEncoder: () => ({
            beginRenderPass: () => pass,
            finish: vi.fn(),
        }),
        queue: { submit: vi.fn() },
    };
    renderer.context = {
        getCurrentTexture: () => ({ createView: vi.fn() }),
    };
    return /** @type {Renderer} */ (renderer);
}

function createProgram() {
    const series = { replace: vi.fn() };
    return {
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
