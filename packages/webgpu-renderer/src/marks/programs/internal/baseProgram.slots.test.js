import { describe, expect, it, vi } from "vitest";
import BaseProgram from "./baseProgram.js";
import { createMockRenderer } from "../../../testUtils/mockRenderer.js";
import { attachScaleDefinitions } from "../../../../testUtils/scaleDefinitions.js";

class SlotProgram extends BaseProgram {
    get channelOrder() {
        return ["uniqueId", "x", "size", "fill"];
    }

    get channelSpecs() {
        return /** @type {Record<string, import("../../utils/channelSpecUtils.js").ChannelSpec>} */ ({
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

class ExtraSlotProgram extends SlotProgram {
    /** @returns {{ name: string, type: "f32", components: 1 }[]} */
    getExtraUniformLayout() {
        return [{ name: "uExtra", type: "f32", components: 1 }];
    }

    _initializeExtraUniforms() {
        this._setUniformValue("uExtra", 1);
    }
}

describe("BaseProgram slot handles", () => {
    it("updates interval targets atomically through a retained slot", () => {
        const renderer = createMockRenderer();
        const program = createSlotProgram(renderer, {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: { data: new Float32Array([0, 1]), type: "f32" },
                size: { value: 1, type: "f32" },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                    conditions: [
                        {
                            when: {
                                selection: "brush",
                                type: "interval",
                                targets: [{ input: "x" }],
                            },
                            value: [1, 0, 0, 1],
                        },
                    ],
                },
            },
        });
        const writeBuffer = vi.spyOn(renderer.device.queue, "writeBuffer");
        const markPickingDirty = vi.spyOn(renderer, "markPickingDirty");
        const createPipeline = vi.spyOn(
            renderer.device,
            "createRenderPipeline"
        );
        const createBindGroup = vi.spyOn(renderer.device, "createBindGroup");
        const slot = program.getSlotHandles().selections.brush;

        expect(slot.type).toBe("interval");
        if (slot.type !== "interval") {
            throw new Error("Expected an interval selection slot.");
        }
        expect(slot.targets).toEqual(["x"]);

        slot.set({ x: [4, 1] });

        expect(writeBuffer).toHaveBeenCalledOnce();
        expect(markPickingDirty).toHaveBeenCalledOnce();
        expect(createPipeline).not.toHaveBeenCalled();
        expect(createBindGroup).not.toHaveBeenCalled();

        writeBuffer.mockClear();
        markPickingDirty.mockClear();
        slot.set({});
        expect(writeBuffer).toHaveBeenCalledOnce();
        expect(markPickingDirty).toHaveBeenCalledOnce();

        writeBuffer.mockClear();
        markPickingDirty.mockClear();
        expect(() => slot.set({ unknown: [0, 1] })).toThrow(
            'cannot update unknown target "unknown"'
        );
        expect(writeBuffer).not.toHaveBeenCalled();
        expect(markPickingDirty).not.toHaveBeenCalled();
    });

    it("updates scale domains through slots", () => {
        const renderer = createMockRenderer();
        const program = createSlotProgram(renderer, {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    scale: {
                        type: "linear",
                        domain: [0, 1],
                        range: [0, 1],
                    },
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
        const program = createSlotProgram(renderer, {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    scale: {
                        type: "linear",
                        domain: [0, 1],
                        range: [0, 1],
                    },
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

    it("batches retained slot updates into one uniform upload", () => {
        const renderer = createMockRenderer();
        const program = createSlotProgram(renderer, {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                    scale: {
                        type: "linear",
                        domain: [0, 1],
                        range: [0, 1],
                    },
                },
                size: { value: 1, type: "f32", dynamic: true },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                },
            },
        });
        const writeBuffer = vi.spyOn(renderer.device.queue, "writeBuffer");
        const markPickingDirty = vi.spyOn(renderer, "markPickingDirty");
        const slots = program.getSlotHandles();

        slots.batchUpdates(() => {
            slots.scales.x.setDomain([2, 4]);
            slots.scales.x.setRange([10, 20]);
            slots.values.size.set(5);
        });

        expect(writeBuffer).toHaveBeenCalledOnce();
        expect(markPickingDirty).toHaveBeenCalledOnce();
    });

    it("updates dynamic extra uniforms through slots", () => {
        const renderer = createMockRenderer();
        const program = new ExtraSlotProgram(renderer, {
            channels: {
                uniqueId: { data: new Uint32Array([0]), type: "u32" },
                x: { data: new Float32Array([0]), type: "f32" },
                size: { value: 1, type: "f32", dynamic: true },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                },
            },
            dynamicValues: { uExtra: { value: 2 } },
        });

        const entry = program._uniformBufferState.entries.get("uExtra");
        expect(entry).toBeTruthy();
        program.getSlotHandles().extraValues.uExtra.set(3);

        expect(
            program._uniformBufferState.view.getFloat32(entry.offset, true)
        ).toBe(3);
    });

    it("replaces a single conditional series through its logical channel", () => {
        const program = createSlotProgram(createMockRenderer(), {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: { data: new Float32Array([0, 1]), type: "f32" },
                size: { value: 1, type: "f32" },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                    conditions: [
                        {
                            when: {
                                selection: "brush",
                                type: "single",
                            },
                            channel: {
                                data: new Float32Array(8),
                                type: "f32",
                                components: 4,
                            },
                        },
                    ],
                },
            },
        });
        const nextFill = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]);

        program.getSlotHandles().series.replace({
            uniqueId: new Uint32Array([2, 3]),
            x: new Float32Array([2, 3]),
            fill: nextFill,
        });

        expect(program._channels.fill__cond0.data).toBe(nextFill);
        expect(program._channels.fill.value).toEqual([0, 0, 0, 1]);
    });

    it("keeps multiple conditional series renderable but not replaceable", () => {
        const first = new Float32Array(8);
        const second = new Float32Array(8);
        const program = createSlotProgram(createMockRenderer(), {
            channels: {
                uniqueId: { data: new Uint32Array([0, 1]), type: "u32" },
                x: { data: new Float32Array([0, 1]), type: "f32" },
                size: { value: 1, type: "f32" },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                    conditions: [
                        {
                            when: {
                                selection: "first",
                                type: "single",
                            },
                            channel: {
                                data: first,
                                type: "f32",
                                components: 4,
                            },
                        },
                        {
                            when: {
                                selection: "second",
                                type: "single",
                            },
                            channel: {
                                data: second,
                                type: "f32",
                                components: 4,
                            },
                        },
                    ],
                },
            },
        });

        expect(program._channels.fill__cond0.data).toBe(first);
        expect(program._channels.fill__cond1.data).toBe(second);
        expect(() =>
            program.getSlotHandles().series.replace({
                uniqueId: new Uint32Array([2, 3]),
                x: new Float32Array([2, 3]),
                fill: new Float32Array(8),
            })
        ).toThrow(
            'Series replacement for channel "fill" is not supported because it has multiple series-backed branches.'
        );
    });

    it("rejects updates through retained handles after destruction", () => {
        const program = createSlotProgram(createMockRenderer(), {
            channels: {
                uniqueId: { data: new Uint32Array([0]), type: "u32" },
                x: {
                    data: new Float32Array([0]),
                    type: "f32",
                    scale: {
                        type: "linear",
                        domain: [0, 1],
                        range: [0, 1],
                    },
                },
                size: { value: 1, type: "f32", dynamic: true },
                fill: {
                    value: [0, 0, 0, 1],
                    type: "f32",
                    components: 4,
                },
            },
        });
        const slots = program.getSlotHandles();

        program.destroy();
        program.destroy();

        expect(() =>
            slots.series.replace({
                uniqueId: new Uint32Array([1]),
                x: new Float32Array([1]),
            })
        ).toThrow("SlotProgram has been destroyed.");
        expect(() => slots.scales.x.setDomain([1, 2])).toThrow(
            "SlotProgram has been destroyed."
        );
        expect(() => slots.values.size.set(2)).toThrow(
            "SlotProgram has been destroyed."
        );
    });
});

/**
 * Keep legacy-shaped fixtures readable while exercising definition-driven
 * program internals.
 *
 * @param {ReturnType<typeof createMockRenderer>} renderer
 * @param {{channels: Record<string, import("../../../index.d.ts").ChannelConfigInput>}} config
 */
function createSlotProgram(renderer, config) {
    attachScaleDefinitions(config.channels);
    return new SlotProgram(renderer, config);
}
