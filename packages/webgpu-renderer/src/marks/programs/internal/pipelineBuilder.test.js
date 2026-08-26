import { describe, expect, it } from "vitest";
import { buildPipelines } from "./pipelineBuilder.js";
import { compileTestMarkChannels } from "../../../../testUtils/scaleDefinitions.js";

describe("buildPipelines", () => {
    it("shares shader resources between visible and picking pipelines", () => {
        /** @type {GPURenderPipelineDescriptor[]} */
        const renderPipelineArgs = [];
        /** @type {GPUBindGroupLayoutDescriptor[]} */
        const bindGroupLayoutArgs = [];
        /** @type {GPUPipelineLayoutDescriptor[]} */
        const pipelineLayoutArgs = [];
        /** @type {GPUShaderModuleDescriptor[]} */
        const shaderModuleArgs = [];
        let shaderModuleCalls = 0;
        let pipelineLayoutCalls = 0;
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
                        (args) => {
                            bindGroupLayoutArgs.push(args);
                            return bindGroupLayout;
                        }
                    ),
                createPipelineLayout:
                    /** @type {(args: GPUPipelineLayoutDescriptor) => GPUPipelineLayout} */ (
                        (args) => {
                            pipelineLayoutCalls += 1;
                            pipelineLayoutArgs.push(args);
                            return /** @type {unknown} */ ({
                                bindGroupLayouts: args.bindGroupLayouts,
                            });
                        }
                    ),
                createShaderModule:
                    /** @type {(args: GPUShaderModuleDescriptor) => GPUShaderModule} */ (
                        (args) => {
                            shaderModuleCalls += 1;
                            shaderModuleArgs.push(args);
                            return /** @type {unknown} */ ({
                                code: args.code,
                            });
                        }
                    ),
                createRenderPipeline:
                    /** @type {(args: GPURenderPipelineDescriptor) => GPURenderPipeline} */ (
                        (args) => {
                            renderPipelineArgs.push(args);
                            return /** @type {unknown} */ ({ args });
                        }
                    ),
            })
        );

        const result = buildPipelines({
            device,
            globalBindGroupLayout,
            format: "rgba8unorm",
            pickFormat: "rgba8unorm",
            compiledChannels: compileTestMarkChannels({
                x: {
                    data: new Float32Array([0]),
                    type: "f32",
                    components: 1,
                    inputComponents: 1,
                },
            }),
            uniformLayout: [
                {
                    name: "dummy",
                    type: "f32",
                    components: 1,
                },
            ],
            shaderBody: "",
            packedSeriesLayout: new Map(
                /** @type {[string, import("./packedSeriesLayout.js").PackedSeriesLayoutEntry][]} */ ([
                    [
                        "x",
                        {
                            name: "x",
                            scalarType: "f32",
                            components: 1,
                            offset: 0,
                            stride: 1,
                        },
                    ],
                ])
            ),
            label: "root/points [point]",
        });

        expect(result.resourceLayout).toEqual([
            { name: "seriesF32", role: "series" },
        ]);
        const pipelineArgs = renderPipelineArgs[0];
        const pickPipelineArgs = renderPipelineArgs[1];
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
        expect(pickPipelineArgs.fragment.entryPoint).toBe("fs_pick");
        expect(pickPipelineArgs.layout).toBe(pipelineArgs.layout);
        expect(pickPipelineArgs.vertex.module).toBe(pipelineArgs.vertex.module);
        expect(shaderModuleCalls).toBe(1);
        expect(pipelineLayoutCalls).toBe(1);
        expect(bindGroupLayoutArgs[0].label).toBe(
            "root/points [point]: bind group layout"
        );
        expect(shaderModuleArgs[0].label).toBe("root/points [point]: shader");
        expect(pipelineLayoutArgs[0].label).toBe(
            "root/points [point]: pipeline layout"
        );
        expect(pipelineArgs.label).toBe("root/points [point]: render pipeline");
        expect(pickPipelineArgs.label).toBe(
            "root/points [point]: picking pipeline"
        );
    });
});
