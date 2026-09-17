/* global GPUBufferUsage, GPUTextureUsage */

import { getMsdfAtlasGenerator } from "../../../src/symbols/sparseGpuPathAtlas.js";
import { gpuLabel } from "../../../src/utils/gpuLabel.js";
import PathPointProgram from "../../../src/marks/programs/pathPointProgram.js";
import { RGBA8_PATH_POINT_SHADER_BODY } from "./wasmPathPointProgram.js";

const QUANTIZE_SHADER = /* wgsl */ `
struct Params {
    spread: f32,
};

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    if (any(id.xy >= textureDimensions(source))) {
        return;
    }
    let distance = textureLoad(source, id.xy, 0);
    let encoded = clamp(
        vec4<f32>(0.5) + distance / (2.0 * params.spread),
        vec4<f32>(0.0),
        vec4<f32>(1.0)
    );
    textureStore(output, id.xy, encoded);
}
`;

const pipelineByDevice = new WeakMap();

/** @param {GPUDevice} device */
function getPipeline(device) {
    let pipeline = pipelineByDevice.get(device);
    if (!pipeline) {
        pipeline = device.createComputePipeline({
            label: "development MSDF RGBA8 quantization pipeline",
            layout: "auto",
            compute: {
                module: device.createShaderModule({ code: QUANTIZE_SHADER }),
                entryPoint: "main",
            },
        });
        pipelineByDevice.set(device, pipeline);
    }
    return pipeline;
}

/** Test-only WGSL backend with the production atlas quantized to RGBA8. */
export default class QuantizedGpuPathPointProgram extends PathPointProgram {
    /** @returns {string} */
    get shaderBody() {
        return RGBA8_PATH_POINT_SHADER_BODY;
    }

    /** @returns {void} */
    _initializeExtraResources() {
        const paths = this._markConfig.paths;
        if (!Array.isArray(paths)) {
            throw new Error("PathPoint config requires a paths array.");
        }
        const atlas = getMsdfAtlasGenerator(this.renderer).acquireAtlas(
            paths,
            this._markConfig.atlasOptions,
            gpuLabel(this.label, "comparison source atlas")
        );
        const texture = this.device.createTexture({
            label: gpuLabel(this.label, "quantized comparison atlas"),
            size: [atlas.width, atlas.height],
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC,
        });
        const params = this.device.createBuffer({
            label: gpuLabel(this.label, "quantization parameters"),
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
            params,
            0,
            new Float32Array([atlas.spread])
        );
        const pipeline = getPipeline(this.device);
        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: atlas.texture.createView() },
                { binding: 1, resource: texture.createView() },
                { binding: 2, resource: { buffer: params } },
            ],
        });
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(
            Math.ceil(atlas.width / 8),
            Math.ceil(atlas.height / 8)
        );
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        void this.device.queue
            .onSubmittedWorkDone()
            .then(() => params.destroy());
        this._installPathAtlas(atlas, texture, null, false, "rgba8unorm");
    }
}
