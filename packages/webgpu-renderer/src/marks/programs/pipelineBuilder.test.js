import { describe, expect, it } from "vitest";
import { buildPipeline } from "./pipelineBuilder.js";

describe("buildPipeline", () => {
    it("builds a pipeline with the global bind group layout", () => {
        let renderPipelineArgs;
        const bindGroupLayout = /** @type {GPUBindGroupLayout} */ (
            /** @type {unknown} */ ({ id: "bindGroupLayout" })
        );
        const globalBindGroupLayout = /** @type {GPUBindGroupLayout} */ (
            /** @type {unknown} */ ({ id: "globalLayout" })
        );
        const device = /** @type {GPUDevice} */ (
            /** @type {unknown} */ ({
                createBindGroupLayout:
                    /** @type {(args: GPUBindGroupLayoutDescriptor) => GPUBindGroupLayout} */ (
                        (_args) => bindGroupLayout
                    ),
                createPipelineLayout:
                    /** @type {(args: GPUPipelineLayoutDescriptor) => GPUPipelineLayout} */ (
                        (args) =>
                            /** @type {unknown} */ ({
                                bindGroupLayouts: args.bindGroupLayouts,
                            })
                    ),
                createShaderModule:
                    /** @type {(args: GPUShaderModuleDescriptor) => GPUShaderModule} */ (
                        (args) =>
                            /** @type {unknown} */ ({
                                code: args.code,
                            })
                    ),
                createRenderPipeline:
                    /** @type {(args: GPURenderPipelineDescriptor) => GPURenderPipeline} */ (
                        (args) => {
                            renderPipelineArgs = args;
                            return /** @type {unknown} */ ({ args });
                        }
                    ),
            })
        );

        const result = buildPipeline({
            device,
            globalBindGroupLayout,
            format: "rgba8unorm",
            channels: {
                x: {
                    data: new Float32Array([0]),
                    type: "f32",
                    components: 1,
                    inputComponents: 1,
                },
            },
            uniformLayout: [
                {
                    name: "dummy",
                    type: "f32",
                    components: 1,
                },
            ],
            shaderBody: "",
            seriesBufferAliases: new Map(),
        });

        expect(result.resourceLayout).toEqual([{ name: "x", role: "series" }]);
        const pipelineArgs = /** @type {GPURenderPipelineDescriptor} */ (
            renderPipelineArgs
        );
        const targets = Array.from(pipelineArgs.fragment.targets ?? []);
        const layout =
            /** @type {{ bindGroupLayouts: GPUBindGroupLayout[] }} */ (
                /** @type {unknown} */ (pipelineArgs.layout)
            );

        expect(targets[0]?.format).toBe("rgba8unorm");
        expect(targets[0]?.blend).toEqual({
            color: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
            },
            alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
            },
        });
        expect(layout.bindGroupLayouts[0]).toBe(globalBindGroupLayout);
    });
});
