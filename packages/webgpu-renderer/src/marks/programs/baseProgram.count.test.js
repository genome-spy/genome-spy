import { describe, expect, it } from "vitest";
import BaseProgram from "./baseProgram.js";
import { createMockRenderer } from "../../testUtils/mockRenderer.js";

class TestSeriesProgram extends BaseProgram {
    get channelOrder() {
        return ["x"];
    }

    get channelSpecs() {
        return /** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */ ({
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
        return /** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */ ({
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
});
