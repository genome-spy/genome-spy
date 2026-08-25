import { describe, expect, it, vi } from "vitest";

import { createMockRenderer } from "../../testUtils/mockRenderer.js";
import ArrowProgram from "./arrowProgram.js";
import LinkProgram from "./linkProgram.js";

describe("built-in semantic property slots", () => {
    it("converts arrow API values inside the renderer", () => {
        const renderer = createMockRenderer();
        const program = new ArrowProgram(renderer, {
            channels: endpointChannels(),
        });
        const writeBuffer = vi.spyOn(renderer.device.queue, "writeBuffer");
        const handles = program.getSlotHandles();
        const properties = handles.properties;

        handles.batchUpdates(() => {
            properties.headAngle.set(45);
            properties.headShape.set("open");
            properties.headPlacement.set("outside");
        });

        expect(program.getSlotHandles().properties).toBe(properties);
        expect(readUniform(program, "uHeadSlope", "f32")).toBeCloseTo(1);
        expect(readUniform(program, "uHeadShape", "u32")).toBe(1);
        expect(readUniform(program, "uHeadPlacement", "u32")).toBe(1);
        expect(writeBuffer).toHaveBeenCalledOnce();
        expect(() => properties.headWidth.set("wide")).toThrow(
            'Property "headWidth" must encode to numeric uniform data.'
        );
    });

    it("updates link enums and draw topology through semantic values", () => {
        const renderer = createMockRenderer();
        const program = new LinkProgram(renderer, {
            channels: endpointChannels(),
        });
        const writeBuffer = vi.spyOn(renderer.device.queue, "writeBuffer");
        const properties = program.getSlotHandles().properties;

        properties.linkShape.set("diagonal");
        properties.orient.set("horizontal");
        properties.segments.set(24.4);

        expect(readUniform(program, "uShape", "u32")).toBe(2);
        expect(readUniform(program, "uOrient", "u32")).toBe(1);
        expect(readUniform(program, "uSegmentBreaks", "f32")).toBe(24);
        expect(program._segmentCount).toBe(24);
        expect(writeBuffer).toHaveBeenCalledTimes(3);
    });
});

function endpointChannels() {
    return {
        x: { value: 0 },
        x2: { value: 1 },
        y: { value: 0 },
        y2: { value: 1 },
    };
}

/**
 * @param {import("./internal/baseProgram.js").default} program
 * @param {string} name
 * @param {"f32" | "u32"} type
 */
function readUniform(program, name, type) {
    const entry = program._uniformBufferState.entries.get(name);
    if (!entry) {
        throw new Error(`Missing test uniform: ${name}`);
    }
    return type == "u32"
        ? program._uniformBufferState.view.getUint32(entry.offset, true)
        : program._uniformBufferState.view.getFloat32(entry.offset, true);
}
