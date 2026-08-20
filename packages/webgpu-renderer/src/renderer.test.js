import { describe, expect, test, vi } from "vitest";

import { Renderer, RendererError } from "./renderer.js";

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
        expect(handle.scales).toEqual({});
        expect(renderer._marks.get(handle.markId)).toBe(program);
    });

    test("does not resolve string mark names without compatibility features", () => {
        const renderer = createRendererHarness();

        expect(() =>
            renderer.createMark(
                /** @type {any} */ ("point"),
                /** @type {any} */ ({ channels: {} })
            )
        ).toThrow(RendererError);
    });
});

function createRendererHarness() {
    const renderer = Object.create(Renderer.prototype);
    renderer._legacyMarkDefinitions = new Map();
    renderer._marks = new Map();
    renderer._nextMarkId = 1;
    renderer._pickingDirty = false;
    return /** @type {Renderer} */ (renderer);
}

function createProgram() {
    return {
        getSlotHandles: () => ({ scales: {}, values: {}, selections: {} }),
        updateSeries: vi.fn(),
        updateValues: vi.fn(),
        debugResources: vi.fn(),
        draw: vi.fn(),
        drawPick: vi.fn(),
        destroy: vi.fn(),
    };
}
