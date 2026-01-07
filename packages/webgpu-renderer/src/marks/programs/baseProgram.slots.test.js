import { describe, expect, it } from "vitest";
import BaseProgram from "./baseProgram.js";
import { createMockRenderer } from "../../testUtils/mockRenderer.js";

class SlotProgram extends BaseProgram {
    get channelOrder() {
        return ["uniqueId", "x", "size", "fill"];
    }

    get channelSpecs() {
        return /** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */ ({
            uniqueId: { type: "u32", components: 1 },
            x: { type: "f32", components: 1 },
            size: { type: "f32", components: 1 },
            fill: { type: "f32", components: 4 },
        });
    }

    get shaderBody() {
        return /* wgsl */ `
struct VSOut {
    @builtin(position) position: vec4<f32>,
};

@vertex fn vs_main(@builtin(vertex_index) _idx: u32) -> VSOut {
    var out: VSOut;
    out.position = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return out;
}

@fragment fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
`;
    }
}

describe("BaseProgram slot handles", () => {
    it("updates scale domains through slots", () => {
        const renderer = createMockRenderer();
        const program = new SlotProgram(renderer, {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    scale: { type: "linear", domain: [0, 1], range: [0, 1] },
                },
                size: { value: 1, type: "f32", dynamic: true },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                    dynamic: true,
                },
            },
        });

        const domainEntry =
            program._uniformBufferState.entries.get("uDomain_x");
        program.getSlotHandles().scales.x.setDomain([2, 4]);

        expect(domainEntry).toBeTruthy();
        const stride = domainEntry.stride ?? 16;
        expect(
            program._uniformBufferState.view.getFloat32(
                domainEntry.offset,
                true
            )
        ).toBe(2);
        expect(
            program._uniformBufferState.view.getFloat32(
                domainEntry.offset + stride,
                true
            )
        ).toBe(4);
    });

    it("updates dynamic values through slots", () => {
        const renderer = createMockRenderer();
        const program = new SlotProgram(renderer, {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    scale: { type: "linear", domain: [0, 1], range: [0, 1] },
                },
                size: { value: 1, type: "f32", dynamic: true },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                    dynamic: true,
                    conditions: [
                        {
                            when: {
                                selection: "brush",
                                type: "single",
                            },
                            channel: {
                                value: [1, 0, 0, 1],
                                type: "f32",
                                components: 4,
                                dynamic: true,
                            },
                        },
                    ],
                },
            },
        });

        const sizeEntry = program._uniformBufferState.entries.get("u_size");
        program.getSlotHandles().values.size.set(5);
        expect(sizeEntry).toBeTruthy();
        expect(
            program._uniformBufferState.view.getFloat32(sizeEntry.offset, true)
        ).toBe(5);

        const conditionSlot =
            program.getSlotHandles().values.fill.conditions?.brush;
        expect(conditionSlot).toBeTruthy();
        const fillEntry =
            program._uniformBufferState.entries.get("u_fill__cond0");
        conditionSlot.set([0.2, 0.4, 0.6, 1]);
        expect(fillEntry).toBeTruthy();
        expect(
            program._uniformBufferState.view.getFloat32(fillEntry.offset, true)
        ).toBeCloseTo(0.2);
    });
});
