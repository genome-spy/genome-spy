import { describe, expect, it } from "vitest";
import { buildMarkShader } from "./markShaderBuilder.js";
import RectProgram from "../programs/rectProgram.js";
import { createMockRenderer } from "../../testUtils/mockRenderer.js";

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
        const { shaderCode, resourceBindings } = buildMarkShader({
            channels: {
                x: {
                    data: new Float32Array(4),
                    type: "f32",
                    components: 1,
                    scale: { type: "linear", domain: [0, 1], range: [0, 1] },
                },
            },
            uniformLayout: [
                {
                    name: "uDomain_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uRange_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uDomainMapCount_x",
                    type: "f32",
                    components: 1,
                },
            ],
            shaderBody,
        });

        expect(resourceBindings.length).toBe(1);
        expect(shaderCode).toContain("fn read_x");
        expect(shaderCode).toContain("fn getScaled_x");
        expect(shaderCode).toContain("uDomain_x");
        expect(shaderCode).toContain("uRange_x");
    });

    it("generates value accessors for value-based channels", () => {
        const { shaderCode, resourceBindings } = buildMarkShader({
            channels: {
                fill: {
                    value: [1, 0, 0, 1],
                    components: 4,
                    dynamic: true,
                },
            },
            uniformLayout: [{ name: "u_fill", type: "f32", components: 4 }],
            shaderBody,
        });

        expect(resourceBindings.length).toBe(0);
        expect(shaderCode).toContain("fn getScaled_fill");
        expect(shaderCode).toContain("u_fill: vec4<f32>");
    });

    it("inlines constants for non-dynamic values", () => {
        const { shaderCode, resourceBindings } = buildMarkShader({
            channels: {
                opacity: {
                    value: 0.75,
                    components: 1,
                },
            },
            uniformLayout: [],
            shaderBody,
        });

        expect(resourceBindings.length).toBe(0);
        expect(shaderCode).toContain("fn getScaled_opacity");
        expect(shaderCode).toContain("return 0.75");
        expect(shaderCode).not.toContain("u_opacity");
    });

    it("binds domain maps for ordinal band domains", () => {
        const { shaderCode, resourceLayout } = buildMarkShader({
            channels: {
                x: {
                    data: new Uint32Array(3),
                    type: "u32",
                    components: 1,
                    scale: {
                        type: "band",
                        domain: [10, 20, 30],
                        range: [0, 1],
                    },
                },
            },
            uniformLayout: [
                {
                    name: "uDomain_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uRange_x",
                    type: "f32",
                    components: 1,
                    arrayLength: 2,
                },
                {
                    name: "uDomainMapCount_x",
                    type: "f32",
                    components: 1,
                },
            ],
            shaderBody,
        });

        expect(resourceLayout).toEqual([
            { name: "x", role: "series" },
            { name: "x", role: "domainMap" },
        ]);
        expect(shaderCode).toContain("hashLookup");
        expect(shaderCode).toContain("domainMap_x");
    });

    it("dedupes shared series buffers", () => {
        const shared = new Float32Array(4);
        const { resourceLayout } = buildMarkShader({
            channels: {
                x: { data: shared, type: "f32" },
                x2: { data: shared, type: "f32" },
            },
            uniformLayout: [],
            shaderBody,
            seriesBufferAliases: new Map([["x2", "x"]]),
        });

        const seriesEntries = resourceLayout.filter(
            (entry) => entry.role === "series"
        );
        expect(seriesEntries).toEqual([{ name: "x", role: "series" }]);
    });

    it("throws when updating non-dynamic uniforms", () => {
        const renderer = createMockRenderer();
        const program = new RectProgram(renderer, {
            count: 1,
            channels: {
                x: { value: 0, dynamic: true, scale: { type: "identity" } },
                x2: { value: 1, dynamic: true, scale: { type: "identity" } },
                y: { value: 0, dynamic: true, scale: { type: "identity" } },
                y2: { value: 1, dynamic: true, scale: { type: "identity" } },
                fillOpacity: { value: 1.0 },
            },
        });

        expect(() => program.updateValues({ fillOpacity: 0.5 })).toThrow(
            /u_fillOpacity/
        );
    });
});
