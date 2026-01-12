/* global GPUShaderStage, GPUBufferUsage, GPUTextureUsage, GPUMapMode, process */
import fs from "node:fs";
import path from "node:path";
import { buildMarkShader } from "../src/marks/shaders/markShaderBuilder.js";
import {
    buildPackedSeriesLayout,
    packSeriesArrays,
} from "../src/marks/programs/internal/packedSeriesLayout.js";
import { buildUniformData } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;
const SHOULD_DUMP = process.env.DUMP_MARK_SHADER === "1";

/**
 * @param {string} name
 * @returns {string}
 */
function slugifyDumpName(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

/**
 * @param {string} name
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ShaderBuildResult} result
 */
function dumpScaleShader(name, result) {
    if (!SHOULD_DUMP) {
        return;
    }
    const outDir = path.join(process.cwd(), "test-results");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, `mark-shader-${name}.wgsl`),
        result.shaderCode,
        "utf8"
    );
    fs.writeFileSync(
        path.join(outDir, `mark-shader-${name}.json`),
        JSON.stringify(
            {
                resourceLayout: result.resourceLayout,
                resourceBindings: result.resourceBindings,
            },
            null,
            2
        ),
        "utf8"
    );
}

/**
 * @param {object} params
 * @param {number} params.outputBinding
 * @param {string} params.outputType
 * @param {number} params.outputLength
 * @param {string} params.channelName
 * @param {boolean} [params.readSeriesOnly]
 * @returns {string}
 */
function buildComputeBody({
    outputBinding,
    outputType,
    outputLength,
    channelName,
    readSeriesOnly = false,
}) {
    const outputExpr = readSeriesOnly
        ? `read_${channelName}(i)`
        : `getScaled_${channelName}(i)`;
    return /* wgsl */ `
@group(1) @binding(${outputBinding}) var<storage, read_write> output: array<${outputType}>;

const OUTPUT_LEN: u32 = ${outputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= OUTPUT_LEN) {
        return;
    }
    output[i] = ${outputExpr};
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
 * @param {boolean} [params.readSeriesOnly]
 * @param {import("../src/marks/shaders/markShaderBuilder.js").SelectionDef[]} [params.selectionDefs]
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ExtraResourceDef[]} [params.extraResources]
 * @param {string} [params.dumpLabel]
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
    readSeriesOnly = false,
    dumpLabel,
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
        readSeriesOnly,
    });
    const result = buildMarkShader({
        channels,
        uniformLayout,
        shaderBody,
        packedSeriesLayout,
        selectionDefs,
        extraResources,
    });
    const scaleLabel =
        channels[channelName]?.scale?.type ??
        channels[channelName]?.scale?.type ??
        "identity";
    const labelPrefix = dumpLabel ? `${slugifyDumpName(dumpLabel)}-` : "";
    dumpScaleShader(
        `${labelPrefix}${channelName}-${outputType}-${scaleLabel}-u${uniformLayout.length}-s${selectionDefs.length}`,
        result
    );
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
 * @param {{ name?: string, binding?: number, samplerBinding?: number, texture: { format: string, width: number, height: number, bytesPerRow: number, data: number[] } }} [params.texture]
 * @param {boolean} [params.debugCopySeries]
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
        debugCopySeries = false,
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
            debugCopySeries,
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
                if (srcData.length === 0) {
                    throw new Error(
                        "Series buffer payload is empty in the GPU test harness."
                    );
                }
                let sum = 0;
                for (let i = 0; i < srcData.length; i++) {
                    sum += srcData[i];
                }
                if (sum === 0) {
                    throw new Error(
                        "Series buffer payload sums to zero in the GPU test harness."
                    );
                }
                const gpuBuffer = device.createBuffer({
                    size: buffer.byteLength,
                    usage:
                        GPUBufferUsage.STORAGE |
                        GPUBufferUsage.COPY_DST |
                        (debugCopySeries ? GPUBufferUsage.COPY_SRC : 0),
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
            if (debugCopySeries && buffers.length > 0) {
                encoder.copyBufferToBuffer(
                    buffers[0],
                    0,
                    readback,
                    0,
                    outputLength * 4 * outputComponents
                );
            } else {
                encoder.copyBufferToBuffer(
                    outputBuffer,
                    0,
                    readback,
                    0,
                    outputLength * 4 * outputComponents
                );
            }
            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();

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
            debugCopySeries,
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
 * @param {{ name: string, data: number[] | ArrayBufferView, role?: string }[]} [params.extraBuffers]
 * @param {{ binding: number, samplerBinding: number, texture: { format: string, width: number, height: number, bytesPerRow: number, data: number[] } }} [params.texture]
 * @param {number} [params.count]
 * @param {boolean} [params.readSeriesOnly]
 * @param {string} [params.dumpLabel]
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
        readSeriesOnly = false,
        dumpLabel,
    }
) {
    const shouldReadSeriesOnly =
        readSeriesOnly || process.env.SCALE_TEST_READ_SERIES === "1";
    const result = buildScaleComputeShader({
        channels,
        uniformLayout,
        selectionDefs,
        extraResources,
        outputType,
        outputLength,
        channelName,
        readSeriesOnly: shouldReadSeriesOnly,
        dumpLabel,
    });
    const debugCopySeries = process.env.SCALE_TEST_COPY_SERIES === "1";
    const bindings = mapScaleBindings(result);
    const layout = buildPackedSeriesLayout(channels, {});
    const packed = packSeriesArrays({
        channels,
        channelSpecs: {},
        layout,
        count,
    });
    const seriesBuffers = [];
    const toSerializable = (data) =>
        ArrayBuffer.isView(data) ? Array.from(data) : data;

    if (packed.f32) {
        const binding = bindings.find(
            (entry) => entry.role === "series" && entry.name === "seriesF32"
        )?.binding;
        if (binding == null) {
            throw new Error("Series binding for packed f32 data is missing.");
        }
        seriesBuffers.push({
            binding,
            data: toSerializable(packed.f32),
        });
    }
    if (packed.u32) {
        const binding = bindings.find(
            (entry) => entry.role === "series" && entry.name === "seriesU32"
        )?.binding;
        if (binding == null) {
            throw new Error("Series binding for packed u32 data is missing.");
        }
        seriesBuffers.push({
            binding,
            data: toSerializable(packed.u32),
        });
    }
    if (packed.i32) {
        const binding = bindings.find(
            (entry) => entry.role === "series" && entry.name === "seriesI32"
        )?.binding;
        if (binding == null) {
            throw new Error("Series binding for packed i32 data is missing.");
        }
        seriesBuffers.push({
            binding,
            data: toSerializable(packed.i32),
        });
    }

    for (const extra of extraBuffers) {
        const role = extra.role ?? "extraBuffer";
        const binding = bindings.find(
            (entry) => entry.role === role && entry.name === extra.name
        )?.binding;
        if (binding == null) {
            throw new Error(
                `Extra buffer "${extra.name}" with role "${role}" is not bound.`
            );
        }
        seriesBuffers.push({
            binding,
            data: toSerializable(extra.data),
        });
    }

    let resolvedTexture = texture;
    if (
        texture &&
        (texture.binding == null || texture.samplerBinding == null)
    ) {
        const textureName = texture.name ?? channelName;
        const textureBinding = bindings.find(
            (entry) =>
                entry.role === "rangeTexture" && entry.name === textureName
        )?.binding;
        const samplerBinding = bindings.find(
            (entry) =>
                entry.role === "rangeSampler" && entry.name === textureName
        )?.binding;
        if (textureBinding == null || samplerBinding == null) {
            throw new Error(
                `Range texture bindings for "${textureName}" were not generated.`
            );
        }
        resolvedTexture = {
            ...texture,
            binding: textureBinding,
            samplerBinding,
        };
    }

    const uniformData = buildUniformData(uniformLayout, uniforms);
    const output = await runScaleCompute(page, {
        shaderCode: result.shaderCode,
        uniformData,
        seriesBuffers,
        outputBinding: result.outputBinding,
        outputLength,
        outputComponents,
        texture: resolvedTexture,
        debugCopySeries,
    });
    if (process.env.SCALE_TEST_DUMP_OUTPUT === "1") {
        const outDir = path.join(process.cwd(), "test-results");
        fs.mkdirSync(outDir, { recursive: true });
        const label = dumpLabel ? slugifyDumpName(dumpLabel) : "scale-output";
        fs.writeFileSync(
            path.join(outDir, `${label}-output.json`),
            JSON.stringify(
                {
                    channelName,
                    outputType,
                    outputLength,
                    outputComponents,
                    output,
                },
                null,
                2
            ),
            "utf8"
        );
    }
    return output;
}
