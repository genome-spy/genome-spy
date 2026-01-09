/* global GPUShaderStage, GPUBufferUsage, GPUTextureUsage, GPUMapMode */
import { buildMarkShader } from "../src/marks/shaders/markShaderBuilder.js";
import {
    buildPackedSeriesLayout,
    packSeriesArrays,
} from "../src/marks/programs/packedSeriesLayout.js";
import { buildUniformData } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;

/**
 * @param {object} params
 * @param {number} params.outputBinding
 * @param {string} params.outputType
 * @param {number} params.outputLength
 * @param {string} params.channelName
 * @returns {string}
 */
function buildComputeBody({
    outputBinding,
    outputType,
    outputLength,
    channelName,
}) {
    return /* wgsl */ `
@group(1) @binding(${outputBinding}) var<storage, read_write> output: array<${outputType}>;

const OUTPUT_LEN: u32 = ${outputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= OUTPUT_LEN) {
        return;
    }
    output[i] = getScaled_${channelName}(i);
}
`;
}

/**
 * @param {Array<number>|ArrayBufferView} data
 * @returns {number}
 */
function getStorageByteLength(data) {
    if (ArrayBuffer.isView(data)) {
        return data.byteLength;
    }
    return data.length * 4;
}

/**
 * Builds a full compute-ready shader from markShaderBuilder output by
 * appending a tiny compute entry point that calls `getScaled_*` and writes
 * results into a storage buffer.
 *
 * @param {object} params
 * @param {Record<string, import("../src/marks/shaders/markShaderBuilder.js").ChannelConfigResolved>} params.channels
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ShaderBuildParams["uniformLayout"]} params.uniformLayout
 * @param {string} params.outputType
 * @param {number} params.outputLength
 * @param {string} params.channelName
 * @param {import("../src/marks/shaders/markShaderBuilder.js").SelectionDef[]} [params.selectionDefs]
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ExtraResourceDef[]} [params.extraResources]
 * @returns {import("../src/marks/shaders/markShaderBuilder.js").ShaderBuildResult & { outputBinding: number }}
 */
export function buildScaleComputeShader({
    channels,
    uniformLayout,
    outputType,
    outputLength,
    channelName,
    selectionDefs = [],
    extraResources = [],
}) {
    const packedSeriesLayout = buildPackedSeriesLayout(channels, {}).entries;
    const initial = buildMarkShader({
        channels,
        uniformLayout,
        shaderBody: "",
        packedSeriesLayout,
        selectionDefs,
        extraResources,
    });
    const outputBinding = initial.resourceBindings.length + 1;
    const shaderBody = buildComputeBody({
        outputBinding,
        outputType,
        outputLength,
        channelName,
    });
    const result = buildMarkShader({
        channels,
        uniformLayout,
        shaderBody,
        packedSeriesLayout,
        selectionDefs,
        extraResources,
    });
    return { ...result, outputBinding };
}

/**
 * Maps the markShaderBuilder resource layout to concrete binding numbers so
 * tests can attach buffers/textures without duplicating bind-group logic.
 *
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ShaderBuildResult} result
 * @returns {{ binding: number, name: string, role: "series"|"ordinalRange"|"rangeTexture"|"rangeSampler"|"extraBuffer"|"extraTexture"|"extraSampler" }[]}
 */
export function mapScaleBindings(result) {
    return result.resourceLayout.map((entry, index) => ({
        ...entry,
        binding: result.resourceBindings[index].binding,
    }));
}

/**
 * Executes a WGSL compute shader that calls `getScaled_*` for each index.
 * The input series buffers mirror the renderer’s data bindings; the compute
 * pass writes the scaled results into a dedicated output storage buffer that
 * is copied back to JS for assertions.
 *
 * @param {import("@playwright/test").Page} page
 * @param {object} params
 * @param {string} params.shaderCode
 * @param {number[]} params.uniformData
 * @param {Array<{ binding: number, data: number[] | ArrayBufferView }>} [params.seriesBuffers]
 * @param {number} params.outputBinding
 * @param {number} params.outputLength
 * @param {1|4} params.outputComponents
 * @param {{ binding: number, samplerBinding: number, texture: { format: string, width: number, height: number, bytesPerRow: number, data: number[] } }} [params.texture]
 * @returns {Promise<number[]>}
 */
export async function runScaleCompute(
    page,
    {
        shaderCode,
        uniformData,
        seriesBuffers = [],
        outputBinding,
        outputLength,
        outputComponents,
        texture,
    }
) {
    const normalizedSeriesBuffers = seriesBuffers.map((buffer) => ({
        ...buffer,
        byteLength: getStorageByteLength(buffer.data),
    }));
    return page.evaluate(
        async ({
            shaderCode,
            uniformData,
            seriesBuffers,
            outputBinding,
            outputLength,
            outputComponents,
            texture,
            workgroupSize,
        }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("WebGPU adapter is not available.");
            }
            const device = await adapter.requestDevice();

            const globalsData = new Float32Array([1, 1, 1, 0]);
            const paramsData = new Float32Array(uniformData);

            const shaderModule = device.createShaderModule({
                code: shaderCode,
            });

            const group0Layout = device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" },
                    },
                ],
            });

            /** @type {GPUBindGroupLayoutEntry[]} */
            const group1LayoutEntries = [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                ...seriesBuffers.map((buffer) => ({
                    binding: buffer.binding,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "read-only-storage",
                        minBindingSize: buffer.byteLength,
                    },
                })),
                texture
                    ? {
                          binding: texture.binding,
                          visibility: GPUShaderStage.COMPUTE,
                          texture: { sampleType: "float" },
                      }
                    : null,
                texture
                    ? {
                          binding: texture.samplerBinding,
                          visibility: GPUShaderStage.COMPUTE,
                          sampler: { type: "filtering" },
                      }
                    : null,
                {
                    binding: outputBinding,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
            ].filter(Boolean);

            const group1Layout = device.createBindGroupLayout({
                entries: group1LayoutEntries,
            });

            const pipeline = device.createComputePipeline({
                layout: device.createPipelineLayout({
                    bindGroupLayouts: [group0Layout, group1Layout],
                }),
                compute: {
                    module: shaderModule,
                    entryPoint: "main",
                },
            });

            const globalsBuffer = device.createBuffer({
                size: globalsData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(globalsBuffer, 0, globalsData);

            const paramsBuffer = device.createBuffer({
                size: paramsData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(paramsBuffer, 0, paramsData);

            const globalsBindGroup = device.createBindGroup({
                layout: group0Layout,
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: globalsBuffer },
                    },
                ],
            });

            const buffers = seriesBuffers.map((buffer) => {
                const srcData = ArrayBuffer.isView(buffer.data)
                    ? buffer.data
                    : new Float32Array(buffer.data);
                const gpuBuffer = device.createBuffer({
                    size: buffer.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                device.queue.writeBuffer(gpuBuffer, 0, srcData);
                return gpuBuffer;
            });

            let textureView = null;
            let sampler = null;
            if (texture) {
                const gpuTexture = device.createTexture({
                    size: [texture.texture.width, texture.texture.height, 1],
                    format: texture.texture.format,
                    usage:
                        GPUTextureUsage.TEXTURE_BINDING |
                        GPUTextureUsage.COPY_DST,
                });
                device.queue.writeTexture(
                    {
                        texture: gpuTexture,
                    },
                    new Uint8Array(texture.texture.data),
                    {
                        bytesPerRow: texture.texture.bytesPerRow,
                        rowsPerImage: texture.texture.height,
                    },
                    [texture.texture.width, texture.texture.height, 1]
                );
                textureView = gpuTexture.createView();
                sampler = device.createSampler({ magFilter: "linear" });
            }

            const outputBuffer = device.createBuffer({
                size: outputLength * 4 * outputComponents,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const readback = device.createBuffer({
                size: outputLength * 4 * outputComponents,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });

            const group1Entries = [
                {
                    binding: 0,
                    resource: { buffer: paramsBuffer },
                },
                ...buffers.map((buffer, index) => ({
                    binding: seriesBuffers[index].binding,
                    resource: { buffer },
                })),
                textureView
                    ? {
                          binding: texture.binding,
                          resource: textureView,
                      }
                    : null,
                sampler
                    ? {
                          binding: texture.samplerBinding,
                          resource: sampler,
                      }
                    : null,
                {
                    binding: outputBinding,
                    resource: { buffer: outputBuffer },
                },
            ].filter(Boolean);

            const paramsBindGroup = device.createBindGroup({
                layout: group1Layout,
                entries: group1Entries,
            });

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, globalsBindGroup);
            pass.setBindGroup(1, paramsBindGroup);
            pass.dispatchWorkgroups(Math.ceil(outputLength / workgroupSize));
            pass.end();
            encoder.copyBufferToBuffer(
                outputBuffer,
                0,
                readback,
                0,
                outputLength * 4 * outputComponents
            );
            device.queue.submit([encoder.finish()]);

            await readback.mapAsync(GPUMapMode.READ);
            const data = readback.getMappedRange().slice(0);
            readback.unmap();
            return Array.from(new Float32Array(data));
        },
        {
            shaderCode,
            uniformData,
            seriesBuffers: normalizedSeriesBuffers,
            outputBinding,
            outputLength,
            outputComponents,
            texture,
            workgroupSize: WORKGROUP_SIZE,
        }
    );
}

/**
 * Convenience wrapper that builds packed series buffers, resolves bindings,
 * and invokes the compute runner. This keeps test cases focused on inputs
 * and expected outputs instead of WebGPU plumbing.
 *
 * @param {import("@playwright/test").Page} page
 * @param {object} params
 * @param {Record<string, import("../src/marks/shaders/markShaderBuilder.js").ChannelConfigResolved>} params.channels
 * @param {string} params.channelName
 * @param {string} params.outputType
 * @param {number} params.outputLength
 * @param {1|4} params.outputComponents
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ShaderBuildParams["uniformLayout"]} [params.uniformLayout]
 * @param {Record<string, number|number[]|Array<number|number[]>>} [params.uniforms]
 * @param {import("../src/marks/shaders/markShaderBuilder.js").SelectionDef[]} [params.selectionDefs]
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ExtraResourceDef[]} [params.extraResources]
 * @param {{ name: string, data: number[] | ArrayBufferView }[]} [params.extraBuffers]
 * @param {{ binding: number, samplerBinding: number, texture: { format: string, width: number, height: number, bytesPerRow: number, data: number[] } }} [params.texture]
 * @param {number} [params.count]
 * @returns {Promise<number[]>}
 */
export async function runScaleCase(
    page,
    {
        channels,
        channelName,
        outputType,
        outputLength,
        outputComponents,
        uniformLayout = [],
        uniforms = {},
        selectionDefs = [],
        extraResources = [],
        extraBuffers = [],
        texture,
        count = outputLength,
    }
) {
    const result = buildScaleComputeShader({
        channels,
        uniformLayout,
        selectionDefs,
        extraResources,
        outputType,
        outputLength,
        channelName,
    });
    const bindings = mapScaleBindings(result);
    const layout = buildPackedSeriesLayout(channels, {});
    const packed = packSeriesArrays({
        channels,
        channelSpecs: {},
        layout,
        count,
    });
    const seriesBuffers = [];
    if (packed.f32) {
        const binding = bindings.find(
            (entry) => entry.role === "series" && entry.name === "seriesF32"
        )?.binding;
        if (binding == null) {
            throw new Error("Series binding for packed f32 data is missing.");
        }
        seriesBuffers.push({ binding, data: packed.f32 });
    }
    if (packed.u32) {
        const binding = bindings.find(
            (entry) => entry.role === "series" && entry.name === "seriesU32"
        )?.binding;
        if (binding == null) {
            throw new Error("Series binding for packed u32 data is missing.");
        }
        seriesBuffers.push({ binding, data: packed.u32 });
    }
    if (packed.i32) {
        const binding = bindings.find(
            (entry) => entry.role === "series" && entry.name === "seriesI32"
        )?.binding;
        if (binding == null) {
            throw new Error("Series binding for packed i32 data is missing.");
        }
        seriesBuffers.push({ binding, data: packed.i32 });
    }

    for (const extra of extraBuffers) {
        const binding = bindings.find(
            (entry) => entry.role === "extraBuffer" && entry.name === extra.name
        )?.binding;
        if (binding == null) {
            throw new Error(`Extra buffer "${extra.name}" is not bound.`);
        }
        seriesBuffers.push({ binding, data: extra.data });
    }

    const uniformData = buildUniformData(uniformLayout, uniforms);
    return runScaleCompute(page, {
        shaderCode: result.shaderCode,
        uniformData,
        seriesBuffers,
        outputBinding: result.outputBinding,
        outputLength,
        outputComponents,
        texture,
    });
}
