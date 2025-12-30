import { describe, expect, it } from "vitest";
import { buildMarkShader } from "./markShaderBuilder.js";

const shaderBody = `
@vertex
fn vs_main() -> @builtin(position) vec4<f32> {
  return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`;

describe("buildMarkShader", () => {
    it("generates buffer bindings and accessors for series data", () => {
        const { shaderCode, bufferBindings } = buildMarkShader({
            channels: {
                x: {
                    data: new Float32Array(4),
                    type: "f32",
                    components: 1,
                    scale: { type: "linear", domain: [0, 1], range: [0, 1] },
                },
            },
            uniformLayout: [
                { name: "uDomain_x", type: "f32", components: 2 },
                { name: "uRange_x", type: "f32", components: 2 },
            ],
            shaderBody,
        });

        expect(bufferBindings.length).toBe(1);
        expect(shaderCode).toContain("fn read_x");
        expect(shaderCode).toContain("fn getScaled_x");
        expect(shaderCode).toContain("scaleLinear");
    });

    it("generates value accessors for value-based channels", () => {
        const { shaderCode, bufferBindings } = buildMarkShader({
            channels: {
                fill: {
                    value: [1, 0, 0, 1],
                    components: 4,
                },
            },
            uniformLayout: [{ name: "u_fill", type: "f32", components: 4 }],
            shaderBody,
        });

        expect(bufferBindings.length).toBe(0);
        expect(shaderCode).toContain("fn getScaled_fill");
        expect(shaderCode).toContain("u_fill: vec4<f32>");
    });
});
