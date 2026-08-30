import { describe, expect, it, vi } from "vitest";
import BaseProgram, { setDebugResourcesEnabled } from "./baseProgram.js";
import { createMockRenderer } from "../../../testUtils/mockRenderer.js";

class TestSeriesProgram extends BaseProgram {
    get channelOrder() {
        return ["x"];
    }

    get channelSpecs() {
        return /** @type {Record<string, import("../../utils/channelSpecUtils.js").ChannelSpec>} */ ({
            x: { type: "f32", components: 1 },
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

class TestValueProgram extends BaseProgram {
    get channelOrder() {
        return ["y"];
    }

    get channelSpecs() {
        return /** @type {Record<string, import("../../utils/channelSpecUtils.js").ChannelSpec>} */ ({
            y: { type: "f32", components: 1 },
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

describe("BaseProgram count inference", () => {
    it("shares templates while keeping mutable mark resources independent", () => {
        const renderer = createMockRenderer();
        const config = {
            channels: {
                x: {
                    data: new Float32Array([0, 1]),
                    type: /** @type {const} */ ("f32"),
                },
            },
        };

        const first = new TestSeriesProgram(renderer, config, {
            label: "first mark",
        });
        const second = new TestSeriesProgram(renderer, config, {
            label: "second mark",
        });

        expect(second._pipeline).toBe(first._pipeline);
        expect(second._getPickPipeline).toBe(first._getPickPipeline);
        expect(second._bindGroupLayout).toBe(first._bindGroupLayout);
        expect(second._uniformBuffer).not.toBe(first._uniformBuffer);
        expect(second._bindGroup).not.toBe(first._bindGroup);
        expect(first._programTemplateDiagnostics).toBe(
            second._programTemplateDiagnostics
        );
        expect(first._programTemplateDiagnostics.borrowerLabels).toEqual(
            new Set(["first mark", "second mark"])
        );
    });

    it("reports the first and all template borrowers in resource diagnostics", () => {
        const renderer = createMockRenderer();
        const config = {
            channels: {
                x: {
                    data: new Float32Array([0]),
                    type: /** @type {const} */ ("f32"),
                },
            },
        };
        const first = new TestSeriesProgram(renderer, config, {
            label: "first mark",
        });
        new TestSeriesProgram(renderer, config, { label: "second mark" });
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

        setDebugResourcesEnabled(true);
        try {
            first.debugResources();
        } finally {
            setDebugResourcesEnabled(false);
        }

        expect(debug).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                programTemplate: {
                    id: 1,
                    firstBorrowerLabel: "first mark",
                    borrowerLabels: ["first mark", "second mark"],
                },
            })
        );
        debug.mockRestore();
    });

    it("infers count from series buffers when omitted", () => {
        const renderer = createMockRenderer();
        const program = new TestSeriesProgram(renderer, {
            channels: {
                x: {
                    data: new Float32Array([0, 1, 2]),
                    type: "f32",
                },
            },
        });

        expect(program.count).toBe(3);
    });

    it("uses packed series bindings by default", () => {
        const renderer = createMockRenderer();
        const program = new TestSeriesProgram(renderer, {
            channels: {
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                },
            },
        });

        expect(program._resourceLayout).toEqual([
            { name: "seriesF32", role: "series" },
        ]);
    });

    it("defaults to one for value-only marks when omitted", () => {
        const renderer = createMockRenderer();
        const program = new TestValueProgram(renderer, {
            channels: {
                y: {
                    value: 1,
                    type: "f32",
                },
            },
        });

        expect(program.count).toBe(1);
    });

    it("updates count when updateSeries omits count", () => {
        const renderer = createMockRenderer();
        const program = new TestSeriesProgram(renderer, {
            channels: {
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                },
            },
        });

        program.updateSeries({ x: new Float32Array([0, 1, 2, 3]) });

        expect(program.count).toBe(4);
    });

    it("replaces complete series through the retained handle slot", () => {
        const renderer = createMockRenderer();
        const program = new TestSeriesProgram(renderer, {
            channels: {
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                },
            },
        });

        program
            .getSlotHandles()
            .series.replace({ x: new Float32Array([0, 1, 2]) });

        expect(program.count).toBe(3);
        expect(() => program.getSlotHandles().series.replace({})).toThrow(
            'Series replacement is missing channel "x".'
        );
    });

    it("rebuilds its bind group only when a packed buffer is replaced", () => {
        const renderer = createMockRenderer();
        const program = new TestSeriesProgram(renderer, {
            channels: {
                x: {
                    data: new Float32Array([0, 1]),
                    type: "f32",
                },
            },
        });
        const createBindGroup = vi.spyOn(renderer.device, "createBindGroup");

        program.updateSeries({ x: new Float32Array([2, 3]) }, 2);
        expect(createBindGroup).not.toHaveBeenCalled();

        program.updateSeries({ x: new Float32Array([2, 3, 4]) }, 3);
        expect(createBindGroup).toHaveBeenCalledOnce();
    });
});
