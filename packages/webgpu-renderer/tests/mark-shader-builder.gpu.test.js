/*
 * These GPU tests compile the WGSL emitted by markShaderBuilder, then run a
 * compute pass that calls `getScaled_*` for a chosen channel. We bind the same
 * uniform + storage resources that the real renderer would use, write output to
 * a storage buffer, and read it back for assertions. This keeps the tests close
 * to real WebGPU execution without needing a full render pass.
 */

import { test, expect } from "@playwright/test";
import { color as d3color } from "d3-color";
import { interpolateHcl } from "d3-interpolate";
import { scaleLinear } from "d3-scale";
import { buildMarkShader } from "../src/marks/shaders/markShaderBuilder.js";
import { buildPackedSeriesLayout } from "../src/marks/programs/packedSeriesLayout.js";
import { createSchemeTexture } from "../src/utils/colorUtils.js";
import {
    buildHashTableMap,
    buildHashTableSet,
} from "../src/utils/hashTable.js";
import { UniformBuffer } from "../src/utils/uniformBuffer.js";
import { ensureWebGPU } from "./gpuTestUtils.js";
import { SELECTION_BUFFER_PREFIX } from "../src/wgsl/prefixes.js";

globalThis.GPUShaderStage ??= {
    VERTEX: 0x1,
    FRAGMENT: 0x2,
    COMPUTE: 0x4,
};

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
 * @param {number[]} domain
 * @param {number[]} range
 * @returns {number[]}
 */
function packContinuousDomainRange(domain, range) {
    const data = new Float32Array(16);
    data[0] = domain[0];
    data[4] = domain[1];
    data[8] = range[0];
    data[12] = range[1];
    return Array.from(data);
}

/**
 * @param {import("../src/utils/uniformBuffer.js").UniformSpec[]} layout
 * @param {Record<string, number|number[]|Array<number|number[]>>} values
 * @returns {number[]}
 */
function buildUniformData(layout, values) {
    const buffer = new UniformBuffer(layout);
    for (const [name, value] of Object.entries(values)) {
        buffer.setValue(name, value);
    }
    return Array.from(new Float32Array(buffer.data));
}

/**
 * @param {string} format
 * @returns {number}
 */
function bytesPerPixelForFormat(format) {
    switch (format) {
        case "rgba8unorm":
        case "rgba8unorm-srgb":
            return 4;
        default:
            return 4;
    }
}

/**
 * @param {number} value
 * @param {number} alignment
 * @returns {number}
 */
function alignTo(value, alignment) {
    return Math.ceil(value / alignment) * alignment;
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
 * @param {import("../src/utils/colorUtils.js").TextureData} textureData
 * @returns {{ format: string, width: number, height: number, bytesPerRow: number, data: number[] }}
 */
function packTextureData(textureData) {
    const bytesPerPixel = bytesPerPixelForFormat(textureData.format);
    const unpaddedBytesPerRow = textureData.width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);
    const rowCount = Math.max(1, textureData.height);
    const source = new Uint8Array(
        textureData.data.buffer,
        textureData.data.byteOffset,
        textureData.data.byteLength
    );

    if (bytesPerRow === unpaddedBytesPerRow) {
        return {
            format: textureData.format,
            width: textureData.width,
            height: textureData.height,
            bytesPerRow,
            data: Array.from(source),
        };
    }

    const padded = new Uint8Array(bytesPerRow * rowCount);
    for (let row = 0; row < rowCount; row++) {
        const srcOffset = row * unpaddedBytesPerRow;
        const destOffset = row * bytesPerRow;
        padded.set(
            source.subarray(srcOffset, srcOffset + unpaddedBytesPerRow),
            destOffset
        );
    }

    return {
        format: textureData.format,
        width: textureData.width,
        height: textureData.height,
        bytesPerRow,
        data: Array.from(padded),
    };
}

/**
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
function buildComputeShader({
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
 * @param {import("../src/marks/shaders/markShaderBuilder.js").ShaderBuildResult} result
 * @returns {{ binding: number, name: string, role: "series"|"ordinalRange"|"rangeTexture"|"rangeSampler" }[]}
 */
function mapBindings(result) {
    return result.resourceLayout.map((entry, index) => ({
        ...entry,
        binding: result.resourceBindings[index].binding,
    }));
}

/**
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
async function runMarkShaderCompute(
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
                compute: { module: shaderModule, entryPoint: "main" },
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

            const seriesGpuBuffers = seriesBuffers.map((buffer) => {
                const data = ArrayBuffer.isView(buffer.data)
                    ? buffer.data
                    : new Float32Array(buffer.data);
                const gpuBuffer = device.createBuffer({
                    size: buffer.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                device.queue.writeBuffer(gpuBuffer, 0, data);
                return {
                    binding: buffer.binding,
                    buffer: gpuBuffer,
                    size: buffer.byteLength,
                };
            });

            const outputBuffer = device.createBuffer({
                size: outputLength * outputComponents * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const readBuffer = device.createBuffer({
                size: outputLength * outputComponents * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            let rampTexture = null;
            let sampler = null;
            if (texture) {
                const texData = new Uint8Array(texture.texture.data);
                rampTexture = device.createTexture({
                    size: {
                        width: texture.texture.width,
                        height: texture.texture.height,
                        depthOrArrayLayers: 1,
                    },
                    format: texture.texture.format,
                    usage:
                        GPUTextureUsage.TEXTURE_BINDING |
                        GPUTextureUsage.COPY_DST,
                });
                device.queue.writeTexture(
                    { texture: rampTexture },
                    texData,
                    {
                        bytesPerRow: texture.texture.bytesPerRow,
                        rowsPerImage: texture.texture.height,
                    },
                    {
                        width: texture.texture.width,
                        height: texture.texture.height,
                        depthOrArrayLayers: 1,
                    }
                );
                sampler = device.createSampler({
                    addressModeU: "clamp-to-edge",
                    addressModeV: "clamp-to-edge",
                    magFilter: "linear",
                    minFilter: "linear",
                });
            }

            const group0 = device.createBindGroup({
                layout: group0Layout,
                entries: [{ binding: 0, resource: { buffer: globalsBuffer } }],
            });

            /** @type {GPUBindGroupEntry[]} */
            const group1Entries = [
                { binding: 0, resource: { buffer: paramsBuffer } },
                ...seriesGpuBuffers.map((buffer) => ({
                    binding: buffer.binding,
                    resource: { buffer: buffer.buffer, size: buffer.size },
                })),
                texture
                    ? {
                          binding: texture.binding,
                          resource: rampTexture.createView(),
                      }
                    : null,
                texture
                    ? { binding: texture.samplerBinding, resource: sampler }
                    : null,
                { binding: outputBinding, resource: { buffer: outputBuffer } },
            ].filter(Boolean);

            const group1 = device.createBindGroup({
                layout: group1Layout,
                entries: group1Entries,
            });

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, group0);
            pass.setBindGroup(1, group1);
            pass.dispatchWorkgroups(Math.ceil(outputLength / workgroupSize));
            pass.end();

            encoder.copyBufferToBuffer(
                outputBuffer,
                0,
                readBuffer,
                0,
                outputLength * outputComponents * 4
            );
            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();

            await readBuffer.mapAsync(GPUMapMode.READ);
            const mapped = readBuffer.getMappedRange();
            const copy = new Float32Array(mapped.slice(0));
            readBuffer.unmap();

            return Array.from(copy);
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

test("markShaderBuilder executes series-backed scales in a compute pass", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [0, 0.5, 1];
    const domain = [0, 1];
    const range = [0, 10];
    const reference = scaleLinear().domain(domain).range(range);

    const channels = {
        x: {
            data: new Float32Array(input),
            type: "f32",
            components: 1,
            scale: { type: "linear", domain, range },
        },
    };
    const uniformLayout = [
        { name: "uDomain_x", type: "f32", components: 1, arrayLength: 2 },
        { name: "uRange_x", type: "f32", components: 1, arrayLength: 2 },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "f32",
        outputLength: input.length,
        channelName: "x",
    });
    const bindings = mapBindings(result);
    const seriesBinding = bindings.find(
        (entry) => entry.role === "series" && entry.name === "seriesF32"
    )?.binding;
    if (seriesBinding == null) {
        throw new Error("Series binding for x was not generated.");
    }

    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: packContinuousDomainRange(domain, range),
        seriesBuffers: [{ binding: seriesBinding, data: input }],
        outputBinding: result.outputBinding,
        outputLength: input.length,
        outputComponents: 1,
    });

    expect(output).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(output[index]).toBeCloseTo(reference(value), 5);
    });
});

test("markShaderBuilder passes through identity values for series data", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [0.1, 0.2, 0.3, 0.4];
    const channels = {
        x: {
            data: new Float32Array(input),
            type: "f32",
            components: 1,
        },
    };
    const uniformLayout = [{ name: "dummy", type: "f32", components: 1 }];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "f32",
        outputLength: input.length,
        channelName: "x",
    });
    const bindings = mapBindings(result);
    const seriesBinding = bindings.find(
        (entry) => entry.role === "series" && entry.name === "seriesF32"
    )?.binding;
    if (seriesBinding == null) {
        throw new Error("Series binding for x was not generated.");
    }

    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: [0],
        seriesBuffers: [
            { binding: seriesBinding, data: new Float32Array(input) },
        ],
        outputBinding: result.outputBinding,
        outputLength: input.length,
        outputComponents: 1,
    });

    expect(output).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(output[index]).toBeCloseTo(value, 5);
    });
});

test("markShaderBuilder reads dynamic value uniforms", async ({ page }) => {
    await ensureWebGPU(page);

    const value = 0.75;
    const channels = {
        opacity: {
            value,
            dynamic: true,
            components: 1,
            scale: { type: "identity" },
        },
    };
    const uniformLayout = [{ name: "u_opacity", type: "f32", components: 1 }];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "f32",
        outputLength: 1,
        channelName: "opacity",
    });

    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: [value],
        outputBinding: result.outputBinding,
        outputLength: 1,
        outputComponents: 1,
    });

    expect(output).toEqual([value]);
});

test("markShaderBuilder applies threshold scales to value channels", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const channels = {
        fill: {
            value: 0.5,
            type: "f32",
            components: 4,
            scale: {
                type: "threshold",
                domain: [0],
                range: [
                    [0, 0, 0, 1],
                    [1, 0, 0, 1],
                ],
            },
        },
    };
    const uniformLayout = [
        { name: "uDomain_fill", type: "f32", components: 1, arrayLength: 1 },
        { name: "uRange_fill", type: "f32", components: 4, arrayLength: 2 },
    ];
    const uniformData = buildUniformData(uniformLayout, {
        uDomain_fill: [0],
        uRange_fill: [
            [0, 0, 0, 1],
            [1, 0, 0, 1],
        ],
    });

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "vec4<f32>",
        outputLength: 1,
        channelName: "fill",
    });

    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData,
        outputBinding: result.outputBinding,
        outputLength: 1,
        outputComponents: 4,
    });

    expect(output).toHaveLength(4);
    expect(output[0]).toBeCloseTo(1, 5);
    expect(output[1]).toBeCloseTo(0, 5);
    expect(output[2]).toBeCloseTo(0, 5);
    expect(output[3]).toBeCloseTo(1, 5);
});

test("markShaderBuilder applies ordinal scales to value channels", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const channels = {
        shape: {
            value: 0,
            type: "u32",
            components: 4,
            scale: { type: "ordinal", range: [0, 1] },
        },
    };
    const uniformLayout = [
        { name: "uRangeCount_shape", type: "f32", components: 1 },
        { name: "uDomainMapCount_shape", type: "f32", components: 1 },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "vec4<f32>",
        outputLength: 1,
        channelName: "shape",
    });
    const bindings = mapBindings(result);
    const ordinalBinding = bindings.find(
        (entry) => entry.role === "ordinalRange" && entry.name === "shape"
    )?.binding;
    if (ordinalBinding == null) {
        throw new Error("Ordinal range binding for shape was not generated.");
    }
    const domainMapBinding = bindings.find(
        (entry) => entry.role === "domainMap" && entry.name === "shape"
    )?.binding;
    if (domainMapBinding == null) {
        throw new Error("Domain map binding for shape was not generated.");
    }

    const rangeData = [0, 0, 1, 1, 1, 0, 0, 1];
    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: buildUniformData(uniformLayout, {
            uRangeCount_shape: 2,
            uDomainMapCount_shape: 0,
        }),
        seriesBuffers: [
            { binding: ordinalBinding, data: rangeData },
            { binding: domainMapBinding, data: [0, 0] },
        ],
        outputBinding: result.outputBinding,
        outputLength: 1,
        outputComponents: 4,
    });

    expect(output).toHaveLength(4);
    expect(output[0]).toBeCloseTo(0, 5);
    expect(output[1]).toBeCloseTo(0, 5);
    expect(output[2]).toBeCloseTo(1, 5);
    expect(output[3]).toBeCloseTo(1, 5);
});

test("markShaderBuilder applies ordinal scales with sparse domain maps", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const channels = {
        shape: {
            value: 42,
            type: "u32",
            components: 4,
            scale: {
                type: "ordinal",
                domain: [10, 42, 99],
                range: [
                    [0, 0, 0, 1],
                    [1, 0, 0, 1],
                    [0, 1, 0, 1],
                ],
            },
        },
    };
    const uniformLayout = [
        { name: "uRangeCount_shape", type: "f32", components: 1 },
        { name: "uDomainMapCount_shape", type: "f32", components: 1 },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "vec4<f32>",
        outputLength: 1,
        channelName: "shape",
    });
    const bindings = mapBindings(result);
    const ordinalBinding = bindings.find(
        (entry) => entry.role === "ordinalRange" && entry.name === "shape"
    )?.binding;
    if (ordinalBinding == null) {
        throw new Error("Ordinal range binding for shape was not generated.");
    }
    const domainMapBinding = bindings.find(
        (entry) => entry.role === "domainMap" && entry.name === "shape"
    )?.binding;
    if (domainMapBinding == null) {
        throw new Error("Domain map binding for shape was not generated.");
    }

    const domainMap = buildHashTableMap([
        [10, 0],
        [42, 1],
        [99, 2],
    ]);
    const rangeData = [0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1];
    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: buildUniformData(uniformLayout, {
            uRangeCount_shape: 3,
            uDomainMapCount_shape: domainMap.size,
        }),
        seriesBuffers: [
            { binding: ordinalBinding, data: rangeData },
            { binding: domainMapBinding, data: domainMap.table },
        ],
        outputBinding: result.outputBinding,
        outputLength: 1,
        outputComponents: 4,
    });

    expect(output).toHaveLength(4);
    expect(output[0]).toBeCloseTo(1, 5);
    expect(output[1]).toBeCloseTo(0, 5);
    expect(output[2]).toBeCloseTo(0, 5);
    expect(output[3]).toBeCloseTo(1, 5);
});

test("markShaderBuilder returns zero for missing ordinal categories", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [1, 99];
    const inputData = new Uint32Array(input);
    const domainMap = buildHashTableMap([[1, 0]]);
    const rangeData = [0, 1, 0, 1];

    const channels = {
        fill: {
            data: new Uint32Array(input),
            type: "u32",
            components: 4,
            inputComponents: 1,
            scale: {
                type: "ordinal",
                domain: [1],
                range: [[0, 1, 0, 1]],
            },
        },
    };
    const uniformLayout = [
        { name: "uRangeCount_fill", type: "f32", components: 1 },
        { name: "uDomainMapCount_fill", type: "f32", components: 1 },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "vec4<f32>",
        outputLength: input.length,
        channelName: "fill",
    });
    const bindings = mapBindings(result);
    const seriesBinding = bindings.find(
        (entry) => entry.role === "series" && entry.name === "seriesU32"
    )?.binding;
    const ordinalBinding = bindings.find(
        (entry) => entry.role === "ordinalRange" && entry.name === "fill"
    )?.binding;
    const domainMapBinding = bindings.find(
        (entry) => entry.role === "domainMap" && entry.name === "fill"
    )?.binding;
    if (
        seriesBinding == null ||
        ordinalBinding == null ||
        domainMapBinding == null
    ) {
        throw new Error("Ordinal bindings for fill were not generated.");
    }

    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: buildUniformData(uniformLayout, {
            uRangeCount_fill: 1,
            uDomainMapCount_fill: domainMap.size,
        }),
        seriesBuffers: [
            { binding: seriesBinding, data: inputData },
            { binding: ordinalBinding, data: rangeData },
            { binding: domainMapBinding, data: domainMap.table },
        ],
        outputBinding: result.outputBinding,
        outputLength: input.length,
        outputComponents: 4,
    });

    expect(output).toHaveLength(input.length * 4);
    expect(output.slice(0, 4)).toEqual([0, 1, 0, 1]);
    expect(output.slice(4, 8)).toEqual([0, 0, 0, 0]);
});

test("markShaderBuilder samples range textures for vec4 output", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [0, 0.5, 1];
    const domain = [0, 1];
    const unitRange = [0, 1];
    const interpolator = interpolateHcl("green", "red");
    const reference = scaleLinear()
        .domain(domain)
        .range(["green", "red"])
        .interpolate(interpolateHcl);
    const textureData = createSchemeTexture(interpolator, 256);
    if (!textureData) {
        throw new Error("Failed to create range texture.");
    }

    const channels = {
        fill: {
            data: new Float32Array(input),
            type: "f32",
            components: 4,
            inputComponents: 1,
            scale: { type: "linear", domain, range: interpolator },
        },
    };
    const uniformLayout = [
        { name: "uDomain_fill", type: "f32", components: 1, arrayLength: 2 },
        { name: "uRange_fill", type: "f32", components: 1, arrayLength: 2 },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "vec4<f32>",
        outputLength: input.length,
        channelName: "fill",
    });
    const bindings = mapBindings(result);
    const seriesBinding = bindings.find(
        (entry) => entry.role === "series" && entry.name === "seriesF32"
    )?.binding;
    const textureBinding = bindings.find(
        (entry) => entry.role === "rangeTexture" && entry.name === "fill"
    )?.binding;
    const samplerBinding = bindings.find(
        (entry) => entry.role === "rangeSampler" && entry.name === "fill"
    )?.binding;
    if (
        seriesBinding == null ||
        textureBinding == null ||
        samplerBinding == null
    ) {
        throw new Error("Range texture bindings for fill were not generated.");
    }

    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: packContinuousDomainRange(domain, unitRange),
        seriesBuffers: [{ binding: seriesBinding, data: input }],
        outputBinding: result.outputBinding,
        outputLength: input.length,
        outputComponents: 4,
        texture: {
            binding: textureBinding,
            samplerBinding,
            texture: packTextureData(textureData),
        },
    });

    expect(output).toHaveLength(input.length * 4);
    input.forEach((value, index) => {
        const expected = d3color(reference(value)).rgb();
        const base = index * 4;
        expect(output[base]).toBeCloseTo(expected.r / 255, 2);
        expect(output[base + 1]).toBeCloseTo(expected.g / 255, 2);
        expect(output[base + 2]).toBeCloseTo(expected.b / 255, 2);
        expect(output[base + 3]).toBeCloseTo(1, 5);
    });
});

test("markShaderBuilder clamps range texture sampling to endpoints", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [-0.2, 0, 1, 1.2];
    const domain = [0, 1];
    const unitRange = [0, 1];
    const interpolator = interpolateHcl("green", "red");
    const reference = scaleLinear()
        .domain(domain)
        .range(["green", "red"])
        .interpolate(interpolateHcl);
    const textureData = createSchemeTexture(interpolator, 256);
    if (!textureData) {
        throw new Error("Failed to create range texture.");
    }

    const channels = {
        fill: {
            data: new Float32Array(input),
            type: "f32",
            components: 4,
            inputComponents: 1,
            scale: { type: "linear", domain, range: interpolator, clamp: true },
        },
    };
    const uniformLayout = [
        { name: "uDomain_fill", type: "f32", components: 1, arrayLength: 2 },
        { name: "uRange_fill", type: "f32", components: 1, arrayLength: 2 },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        outputType: "vec4<f32>",
        outputLength: input.length,
        channelName: "fill",
    });
    const bindings = mapBindings(result);
    const seriesBinding = bindings.find(
        (entry) => entry.role === "series" && entry.name === "seriesF32"
    )?.binding;
    const textureBinding = bindings.find(
        (entry) => entry.role === "rangeTexture" && entry.name === "fill"
    )?.binding;
    const samplerBinding = bindings.find(
        (entry) => entry.role === "rangeSampler" && entry.name === "fill"
    )?.binding;
    if (
        seriesBinding == null ||
        textureBinding == null ||
        samplerBinding == null
    ) {
        throw new Error("Range texture bindings for fill were not generated.");
    }

    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData: packContinuousDomainRange(domain, unitRange),
        seriesBuffers: [{ binding: seriesBinding, data: input }],
        outputBinding: result.outputBinding,
        outputLength: input.length,
        outputComponents: 4,
        texture: {
            binding: textureBinding,
            samplerBinding,
            texture: packTextureData(textureData),
        },
    });

    const expectedColors = [
        reference(0),
        reference(0),
        reference(1),
        reference(1),
    ].map((value) => d3color(value).rgb());

    expect(output).toHaveLength(input.length * 4);
    expectedColors.forEach((expected, index) => {
        const base = index * 4;
        expect(output[base]).toBeCloseTo(expected.r / 255, 2);
        expect(output[base + 1]).toBeCloseTo(expected.g / 255, 2);
        expect(output[base + 2]).toBeCloseTo(expected.b / 255, 2);
        expect(output[base + 3]).toBeCloseTo(1, 5);
    });
});

test("markShaderBuilder applies interval selections to conditional values", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = new Float32Array([0, 1, 2, 3]);
    const channels = {
        x: {
            data: input,
            type: "f32",
            components: 1,
        },
        fill: {
            value: 0,
            type: "f32",
            components: 1,
            conditions: [
                {
                    when: {
                        selection: "brush",
                        type: "interval",
                        channel: "x",
                    },
                    value: 1,
                },
            ],
        },
    };
    const uniformLayout = [
        { name: "uSelection_brush", type: "f32", components: 2 },
    ];
    const selectionDefs = [
        {
            name: "brush",
            type: "interval",
            channel: "x",
            scalarType: "f32",
        },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        selectionDefs,
        outputType: "f32",
        outputLength: input.length,
        channelName: "fill",
    });
    const bindings = mapBindings(result);
    const seriesBinding = bindings.find(
        (entry) => entry.role === "series" && entry.name === "seriesF32"
    )?.binding;
    if (seriesBinding == null) {
        throw new Error("Series binding for x was not generated.");
    }

    const uniformData = buildUniformData(uniformLayout, {
        uSelection_brush: [1, 2],
    });
    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData,
        seriesBuffers: [{ binding: seriesBinding, data: input }],
        outputBinding: result.outputBinding,
        outputLength: input.length,
        outputComponents: 1,
    });

    expect(output).toEqual([0, 1, 1, 0]);
});

test("markShaderBuilder applies multi selections via hash tables", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const ids = new Uint32Array([10, 11, 12, 13]);
    const channels = {
        uniqueId: {
            data: ids,
            type: "u32",
            components: 1,
        },
        fill: {
            value: 0,
            type: "f32",
            components: 1,
            conditions: [
                {
                    when: {
                        selection: "picked",
                        type: "multi",
                    },
                    value: 1,
                },
            ],
        },
    };
    const uniformLayout = [
        { name: "uSelectionCount_picked", type: "u32", components: 1 },
    ];
    const selectionDefs = [{ name: "picked", type: "multi" }];
    const selectionBufferName = SELECTION_BUFFER_PREFIX + "picked";
    const extraResources = [
        {
            name: selectionBufferName,
            kind: "buffer",
            role: "extraBuffer",
            wgslName: selectionBufferName,
            wgslType: "array<HashEntry>",
            bufferType: "read-only-storage",
            visibility: "vertex",
        },
    ];

    const result = buildComputeShader({
        channels,
        uniformLayout,
        selectionDefs,
        extraResources,
        outputType: "f32",
        outputLength: ids.length,
        channelName: "fill",
    });
    const bindings = mapBindings(result);
    const seriesBinding = bindings.find(
        (entry) => entry.role === "series" && entry.name === "seriesU32"
    )?.binding;
    const selectionBinding = bindings.find(
        (entry) =>
            entry.role === "extraBuffer" && entry.name === selectionBufferName
    )?.binding;
    if (seriesBinding == null || selectionBinding == null) {
        throw new Error("Selection bindings were not generated.");
    }

    const { table, size } = buildHashTableSet([11, 13]);
    const uniformData = buildUniformData(uniformLayout, {
        uSelectionCount_picked: size,
    });
    const output = await runMarkShaderCompute(page, {
        shaderCode: result.shaderCode,
        uniformData,
        seriesBuffers: [
            { binding: seriesBinding, data: ids },
            { binding: selectionBinding, data: table },
        ],
        outputBinding: result.outputBinding,
        outputLength: ids.length,
        outputComponents: 1,
    });

    expect(output).toEqual([0, 1, 0, 1]);
});
