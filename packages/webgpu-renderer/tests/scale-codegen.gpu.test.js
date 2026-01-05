import { test, expect } from "@playwright/test";
import { color as d3color } from "d3-color";
import { interpolateHcl, interpolateRgb } from "d3-interpolate";
import {
    scaleLinear,
    scaleLog,
    scaleQuantize,
    scaleSequential,
    scaleThreshold,
} from "d3-scale";
import getScaleWgsl from "../src/wgsl/scales.wgsl.js";
import {
    buildScaledFunction,
    getScaleOutputType,
} from "../src/marks/scales/scaleCodegen.js";
import { createSchemeTexture } from "../src/utils/colorUtils.js";
import { normalizeRangePositions } from "../src/marks/scales/scaleStops.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;

/**
 * @param {object} params
 * @param {string} params.scale
 * @param {import("../index.d.ts").ChannelScale} [params.scaleConfig]
 * @param {string} [params.name]
 * @param {string} [params.rawValueExpr]
 * @param {"f32"|"u32"|"i32"} [params.inputScalarType]
 * @param {1|2|4} [params.inputComponents]
 * @param {1|2|4} [params.outputComponents]
 * @param {"f32"|"u32"|"i32"} [params.outputScalarType]
 * @param {boolean} [params.useRangeTexture]
 * @returns {string}
 */
function buildScaleFn({
    scale,
    scaleConfig,
    name = "x",
    rawValueExpr = "input[i]",
    inputScalarType = "f32",
    inputComponents = 1,
    outputComponents = 1,
    outputScalarType,
    useRangeTexture = false,
}) {
    const resolvedScale = scaleConfig?.type ?? scale;
    const resolvedOutputScalar =
        outputComponents === 1
            ? (outputScalarType ??
              getScaleOutputType(resolvedScale, inputScalarType))
            : "f32";
    return buildScaledFunction({
        name,
        scale,
        rawValueExpr,
        inputScalarType,
        inputComponents,
        outputComponents,
        outputScalarType: resolvedOutputScalar,
        scaleConfig,
        useRangeTexture,
    });
}

/**
 * @param {object} params
 * @param {string} params.scaleFn
 * @param {number} params.inputLength
 * @param {1|4} [params.outputComponents]
 * @param {number} [params.domainLength]
 * @param {number} [params.rangeLength]
 * @param {string[]} [params.extraUniformFields]
 * @returns {string}
 */
function buildScaleCodegenShader({
    scaleFn,
    inputLength,
    outputComponents = 1,
    domainLength = 2,
    rangeLength = 2,
    extraUniformFields = [],
}) {
    const scalesWgsl = getScaleWgsl();
    const outputType = outputComponents === 1 ? "f32" : "vec4<f32>";
    const guardExpr = outputComponents === 1 ? "guard" : "vec4<f32>(guard)";
    const extraFields = extraUniformFields.length
        ? `\n    ${extraUniformFields.join("\n    ")}`
        : "";
    return `
struct Globals {
    width: f32,
    height: f32,
    dpr: f32,
    uZero: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

${scalesWgsl}

struct Params {
    uDomain_x: array<vec4<f32>, ${domainLength}>,
    uRange_x: array<vec4<f32>, ${rangeLength}>,
${extraFields}
};

@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> input: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<${outputType}>;

${scaleFn}

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let guard = globals.uZero;
    output[i] = getScaled_x(i) + ${guardExpr};
}
`;
}

/**
 * @param {object} params
 * @param {string} params.scaleFn
 * @param {number} params.inputLength
 * @param {number} [params.domainLength]
 * @param {number} [params.rangeLength]
 * @returns {string}
 */
function buildScaleCodegenRampShader({
    scaleFn,
    inputLength,
    domainLength = 2,
    rangeLength = 2,
}) {
    const scalesWgsl = getScaleWgsl();
    return `
struct Globals {
    width: f32,
    height: f32,
    dpr: f32,
    uZero: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

${scalesWgsl}

struct Params {
    uDomain_x: array<vec4<f32>, ${domainLength}>,
    uRange_x: array<vec4<f32>, ${rangeLength}>,
};

@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> input: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<vec4<f32>>;
@group(0) @binding(4) var rampTexture: texture_2d<f32>;
@group(0) @binding(5) var rampSampler: sampler;

${scaleFn}

fn sampleRamp(unitValue: f32) -> vec3<f32> {
    return textureSampleLevel(
        rampTexture,
        rampSampler,
        vec2<f32>(unitValue, 0.0),
        0.0
    ).rgb;
}

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let guard = globals.uZero;
    let unitValue = clamp(getScaled_x(i), 0.0, 1.0);
    let rgb = sampleRamp(unitValue);
    output[i] = vec4<f32>(rgb, 1.0) + vec4<f32>(guard);
}
`;
}

/**
 * @param {object} params
 * @param {string} params.scaleFn
 * @param {number} params.inputLength
 * @param {number} [params.domainLength]
 * @param {number} [params.rangeLength]
 * @returns {string}
 */
function buildScaleCodegenTextureShader({
    scaleFn,
    inputLength,
    domainLength = 2,
    rangeLength = 2,
}) {
    const scalesWgsl = getScaleWgsl();
    return `
struct Globals {
    width: f32,
    height: f32,
    dpr: f32,
    uZero: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

${scalesWgsl}

struct Params {
    uDomain_x: array<vec4<f32>, ${domainLength}>,
    uRange_x: array<vec4<f32>, ${rangeLength}>,
};

@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> input: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<vec4<f32>>;
@group(0) @binding(4) var uRangeTexture_x: texture_2d<f32>;
@group(0) @binding(5) var uRangeSampler_x: sampler;

${scaleFn}

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let guard = globals.uZero;
    output[i] = getScaled_x(i) + vec4<f32>(guard);
}
`;
}

/**
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @param {number[]} [extraValues]
 * @returns {number[]}
 */
function packContinuousDomainRange(domain, range, extraValues = []) {
    const totalValues = 16 + extraValues.length;
    const paddedValues = Math.ceil(totalValues / 4) * 4;
    const data = new Float32Array(paddedValues);
    data[0] = domain[0];
    data[4] = domain[1];
    data[8] = range[0];
    data[12] = range[1];
    for (let i = 0; i < extraValues.length; i++) {
        data[16 + i] = extraValues[i];
    }
    return Array.from(data);
}

/**
 * @param {[number]} domain
 * @param {number[][]} range
 * @returns {number[]}
 */
function packThresholdDomainRangeVec4(domain, range) {
    const data = new Float32Array(12);
    data[0] = domain[0];
    data.set(range[0], 4);
    data.set(range[1], 8);
    return Array.from(data);
}

/**
 * @param {number[]} domain
 * @param {number[]} range
 * @returns {number[]}
 */
function packPiecewiseDomainRange(domain, range) {
    const total = (domain.length + range.length) * 4;
    const data = new Float32Array(total);
    for (let i = 0; i < domain.length; i++) {
        data[i * 4] = domain[i];
    }
    const rangeOffset = domain.length * 4;
    for (let i = 0; i < range.length; i++) {
        data[rangeOffset + i * 4] = range[i];
    }
    return Array.from(data);
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
 * @param {import("../src/utils/colorUtils.js").TextureData} textureData
 * @returns {{ format: string, width: number, height: number, bytesPerRow: number, data: Uint8Array }}
 */
function prepareTextureData(textureData) {
    const bytesPerPixel = bytesPerPixelForFormat(textureData.format);
    const unpaddedBytesPerRow = textureData.width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);

    if (bytesPerRow === unpaddedBytesPerRow) {
        return {
            ...textureData,
            bytesPerRow,
            data: new Uint8Array(
                textureData.data.buffer,
                textureData.data.byteOffset,
                textureData.data.byteLength
            ),
        };
    }

    const rowCount = Math.max(1, textureData.height);
    const padded = new Uint8Array(bytesPerRow * rowCount);
    const source = new Uint8Array(
        textureData.data.buffer,
        textureData.data.byteOffset,
        textureData.data.byteLength
    );

    for (let row = 0; row < rowCount; row++) {
        const srcOffset = row * unpaddedBytesPerRow;
        const destOffset = row * bytesPerRow;
        padded.set(
            source.subarray(srcOffset, srcOffset + unpaddedBytesPerRow),
            destOffset
        );
    }

    return {
        ...textureData,
        bytesPerRow,
        data: padded,
    };
}

/**
 * @param {import("../src/utils/colorUtils.js").TextureData} textureData
 * @returns {{ format: string, width: number, height: number, bytesPerRow: number, data: number[] }}
 */
function packTextureData(textureData) {
    const prepared = prepareTextureData(textureData);
    const bytes = new Uint8Array(
        prepared.data.buffer,
        prepared.data.byteOffset,
        prepared.data.byteLength
    );
    return {
        format: prepared.format,
        width: prepared.width,
        height: prepared.height,
        bytesPerRow: prepared.bytesPerRow,
        data: Array.from(bytes),
    };
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {object} params
 * @param {string} params.shaderCode
 * @param {number[]} params.input
 * @param {number[]} params.uniformData
 * @param {1|4} [params.outputComponents]
 * @returns {Promise<number[]>}
 */
async function runScaleCodegenCompute(
    page,
    { shaderCode, input, uniformData, outputComponents = 1 }
) {
    return page.evaluate(
        async ({
            shaderCode,
            input,
            uniformData,
            outputComponents,
            workgroupSize,
        }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("WebGPU adapter is not available.");
            }
            const device = await adapter.requestDevice();

            const globalsData = new Float32Array([1, 1, 1, 0]);
            const inputData = new Float32Array(input);
            const packedUniforms = new Float32Array(uniformData);

            const shaderModule = device.createShaderModule({
                code: shaderCode,
            });
            const pipeline = device.createComputePipeline({
                layout: "auto",
                compute: { module: shaderModule, entryPoint: "main" },
            });

            const globalsBuffer = device.createBuffer({
                size: globalsData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(globalsBuffer, 0, globalsData);

            const uniformBuffer = device.createBuffer({
                size: packedUniforms.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(uniformBuffer, 0, packedUniforms);

            const inputBuffer = device.createBuffer({
                size: inputData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(inputBuffer, 0, inputData);

            const outputBuffer = device.createBuffer({
                size: inputData.byteLength * outputComponents,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const readBuffer = device.createBuffer({
                size: inputData.byteLength * outputComponents,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: globalsBuffer } },
                    { binding: 1, resource: { buffer: uniformBuffer } },
                    { binding: 2, resource: { buffer: inputBuffer } },
                    { binding: 3, resource: { buffer: outputBuffer } },
                ],
            });

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(
                Math.ceil(inputData.length / workgroupSize)
            );
            pass.end();

            encoder.copyBufferToBuffer(
                outputBuffer,
                0,
                readBuffer,
                0,
                inputData.byteLength * outputComponents
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
            input,
            uniformData,
            outputComponents,
            workgroupSize: WORKGROUP_SIZE,
        }
    );
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {object} params
 * @param {string} params.shaderCode
 * @param {number[]} params.input
 * @param {number[]} params.uniformData
 * @param {{ format: string, width: number, height: number, bytesPerRow: number, data: number[] }} params.texture
 * @returns {Promise<number[]>}
 */
async function runScaleCodegenRampCompute(
    page,
    { shaderCode, input, uniformData, texture }
) {
    return page.evaluate(
        async ({ shaderCode, input, uniformData, texture, workgroupSize }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("WebGPU adapter is not available.");
            }
            const device = await adapter.requestDevice();

            const globalsData = new Float32Array([1, 1, 1, 0]);
            const inputData = new Float32Array(input);
            const packedUniforms = new Float32Array(uniformData);
            const textureData = new Uint8Array(texture.data);

            const shaderModule = device.createShaderModule({
                code: shaderCode,
            });
            const pipeline = device.createComputePipeline({
                layout: "auto",
                compute: { module: shaderModule, entryPoint: "main" },
            });

            const globalsBuffer = device.createBuffer({
                size: globalsData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(globalsBuffer, 0, globalsData);

            const uniformBuffer = device.createBuffer({
                size: packedUniforms.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(uniformBuffer, 0, packedUniforms);

            const inputBuffer = device.createBuffer({
                size: inputData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(inputBuffer, 0, inputData);

            const outputBuffer = device.createBuffer({
                size: inputData.byteLength * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const readBuffer = device.createBuffer({
                size: inputData.byteLength * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            const rampTexture = device.createTexture({
                size: {
                    width: texture.width,
                    height: texture.height,
                    depthOrArrayLayers: 1,
                },
                format: texture.format,
                usage:
                    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
            device.queue.writeTexture(
                { texture: rampTexture },
                textureData,
                {
                    bytesPerRow: texture.bytesPerRow,
                    rowsPerImage: texture.height,
                },
                {
                    width: texture.width,
                    height: texture.height,
                    depthOrArrayLayers: 1,
                }
            );

            const sampler = device.createSampler({
                addressModeU: "clamp-to-edge",
                addressModeV: "clamp-to-edge",
                magFilter: "linear",
                minFilter: "linear",
            });

            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: globalsBuffer } },
                    { binding: 1, resource: { buffer: uniformBuffer } },
                    { binding: 2, resource: { buffer: inputBuffer } },
                    { binding: 3, resource: { buffer: outputBuffer } },
                    { binding: 4, resource: rampTexture.createView() },
                    { binding: 5, resource: sampler },
                ],
            });

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(
                Math.ceil(inputData.length / workgroupSize)
            );
            pass.end();

            encoder.copyBufferToBuffer(
                outputBuffer,
                0,
                readBuffer,
                0,
                inputData.byteLength * 4
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
            input,
            uniformData,
            texture,
            workgroupSize: WORKGROUP_SIZE,
        }
    );
}

test("scaleCodegen emits WGSL that executes", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [0, 0.5, 1];
    const domain = [0, 1];
    const range = [0, 10];
    const reference = scaleLinear().domain(domain).range(range);
    const codegenFn = buildScaleFn({
        scale: "linear",
        scaleConfig: { type: "linear" },
    });
    const shaderCode = buildScaleCodegenShader({
        scaleFn: codegenFn,
        inputLength: input.length,
    });
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packContinuousDomainRange(domain, range),
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scaleCodegen clamps linear inputs to the domain extent", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [-1, 0, 0.5, 2];
    const domain = [0, 1];
    const range = [0, 10];
    const reference = scaleLinear().domain(domain).range(range).clamp(true);
    const codegenFn = buildScaleFn({
        scale: "linear",
        scaleConfig: { type: "linear", clamp: true },
    });
    const shaderCode = buildScaleCodegenShader({
        scaleFn: codegenFn,
        inputLength: input.length,
    });
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packContinuousDomainRange(domain, range),
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scaleCodegen clamps log inputs to the domain extent", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [0.1, 1, 10, 1000];
    const domain = [1, 100];
    const range = [0, 1];
    const base = 10;
    const reference = scaleLog()
        .domain(domain)
        .range(range)
        .base(base)
        .clamp(true);
    const codegenFn = buildScaleFn({
        scale: "log",
        scaleConfig: { type: "log", clamp: true },
    });
    const shaderCode = buildScaleCodegenShader({
        scaleFn: codegenFn,
        inputLength: input.length,
        extraUniformFields: ["uScaleBase_x: f32,"],
    });
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packContinuousDomainRange(domain, range, [base]),
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scaleCodegen clamps piecewise linear inputs to the domain extent", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [-1, 0, 1, 2, 3];
    const domain = [0, 1, 2];
    const range = [0, 10, 20];
    const reference = scaleLinear().domain(domain).range(range).clamp(true);
    const codegenFn = buildScaleFn({
        scale: "linear",
        scaleConfig: { type: "linear", domain, range, clamp: true },
    });
    const shaderCode = buildScaleCodegenShader({
        scaleFn: codegenFn,
        inputLength: input.length,
        domainLength: domain.length,
        rangeLength: range.length,
    });
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packPiecewiseDomainRange(domain, range),
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scaleCodegen rounds continuous scale outputs like d3 rangeRound", async ({
    page,
}) => {
    await ensureWebGPU(page);

    // const x = d3.scaleLinear().rangeRound([0, 960]);
    const input = [-0.2, 0.1, 0.5, 0.9, 1.2, 1.8];
    const domain = [0, 2];
    const range = [0, 960];
    const reference = scaleLinear()
        .domain(domain)
        .rangeRound(range)
        .clamp(true);
    const codegenFn = buildScaleFn({
        scale: "linear",
        scaleConfig: {
            type: "linear",
            domain,
            range,
            clamp: true,
            round: true,
        },
    });
    const shaderCode = buildScaleCodegenShader({
        scaleFn: codegenFn,
        inputLength: input.length,
    });
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packContinuousDomainRange(domain, range),
    });

    const expected = input.map((value) => reference(value));

    expect(result).toEqual(expected);
});

test("scaleCodegen maps scalars to vec4 via threshold scale", async ({
    page,
}) => {
    // Demonstrates how scalar inputs (e.g., data fields) can drive vec4 outputs
    // via scales, matching fill/stroke channel expectations without raw vec4 inputs.
    await ensureWebGPU(page);

    const input = [0.25, 0.5, 0.75];
    const domain = [0.5];
    const range = [
        [0.9, 0.1, 0.1, 1.0],
        [0.1, 0.7, 0.2, 1.0],
    ];
    const reference = scaleThreshold().domain(domain).range(range);
    const codegenFn = buildScaleFn({
        scale: "threshold",
        outputComponents: 4,
        scaleConfig: { type: "threshold", domain, range },
    });
    const shaderCode = buildScaleCodegenShader({
        scaleFn: codegenFn,
        inputLength: input.length,
        outputComponents: 4,
        domainLength: domain.length,
        rangeLength: range.length,
    });
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packThresholdDomainRangeVec4(domain, range),
        outputComponents: 4,
    });

    expect(result).toHaveLength(input.length * 4);
    input.forEach((value, index) => {
        const expected = reference(value);
        const base = index * 4;
        for (let i = 0; i < 4; i++) {
            expect(result[base + i]).toBeCloseTo(expected[i], 5);
        }
    });
});

test("scaleCodegen matches d3 quantize scale", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [-0.1, 0.2, 0.49, 0.5, 0.75, 1.1];
    const domain = [0, 1];
    const range = [1, 2, 4, 8];
    const reference = scaleQuantize().domain(domain).range(range);
    const codegenFn = buildScaleFn({
        scale: "quantize",
        scaleConfig: { type: "quantize", domain, range },
    });
    const shaderCode = buildScaleCodegenShader({
        scaleFn: codegenFn,
        inputLength: input.length,
        domainLength: domain.length,
        rangeLength: range.length,
    });
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packPiecewiseDomainRange(domain, range),
    });

    const expected = input.map((value) => reference(value));

    expect(result).toEqual(expected);
});

test("scaleCodegen reproduces d3 linear color interpolation via ramp texture", async ({
    page,
}) => {
    // Texture sampling can introduce minor differences versus CPU interpolation.
    await ensureWebGPU(page);

    const input = [0, 0.25, 0.5, 0.75, 1.0];
    const domain = [0, 1];
    const unitRange = [0, 1];
    const colors = ["#ed553b", "#20639b"];
    const gamma = 2.2;
    const gammaInterpolator = interpolateRgb.gamma(gamma);
    const colorScale = scaleLinear()
        .domain(domain)
        .range(colors)
        .interpolate(gammaInterpolator);
    const textureData = createSchemeTexture({
        scheme: colors,
        mode: "interpolate",
        interpolate: gammaInterpolator,
        count: 256,
    });
    if (!textureData) {
        throw new Error("Failed to create a color ramp texture.");
    }

    const codegenFn = buildScaleFn({
        scale: "linear",
        scaleConfig: { type: "linear", domain, range: unitRange },
    });
    const shaderCode = buildScaleCodegenRampShader({
        scaleFn: codegenFn,
        inputLength: input.length,
    });
    const result = await runScaleCodegenRampCompute(page, {
        shaderCode,
        input,
        uniformData: packContinuousDomainRange(domain, unitRange),
        texture: packTextureData(textureData),
    });

    expect(result).toHaveLength(input.length * 4);
    input.forEach((value, index) => {
        const expected = d3color(colorScale(value)).rgb();
        const base = index * 4;
        expect(result[base]).toBeCloseTo(expected.r / 255, 2);
        expect(result[base + 1]).toBeCloseTo(expected.g / 255, 2);
        expect(result[base + 2]).toBeCloseTo(expected.b / 255, 2);
        expect(result[base + 3]).toBeCloseTo(1, 5);
    });
});

test("scaleCodegen accepts interpolator functions in scaleConfig ranges", async ({
    page,
}) => {
    // This mirrors a sequential scale where the range is defined by a function.
    await ensureWebGPU(page);

    const input = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
    const domain = [0, 1];
    const unitRange = [0, 1];
    const interpolator = interpolateHcl("green", "red");
    const colorScale = scaleSequential(interpolator).domain(domain);
    const textureData = createSchemeTexture(interpolator);
    if (!textureData) {
        throw new Error("Failed to create a sequential color ramp texture.");
    }

    const codegenFn = buildScaleFn({
        scale: "linear",
        outputComponents: 4,
        scaleConfig: { type: "linear", domain, range: interpolator },
        useRangeTexture: true,
    });
    const shaderCode = buildScaleCodegenTextureShader({
        scaleFn: codegenFn,
        inputLength: input.length,
    });
    const result = await runScaleCodegenRampCompute(page, {
        shaderCode,
        input,
        uniformData: packContinuousDomainRange(domain, unitRange),
        texture: packTextureData(textureData),
    });

    expect(result).toHaveLength(input.length * 4);
    input.forEach((value, index) => {
        const expected = d3color(colorScale(value)).rgb();
        const base = index * 4;
        expect(result[base]).toBeCloseTo(expected.r / 255, 2);
        expect(result[base + 1]).toBeCloseTo(expected.g / 255, 2);
        expect(result[base + 2]).toBeCloseTo(expected.b / 255, 2);
        expect(result[base + 3]).toBeCloseTo(1, 5);
    });
});

test("scaleCodegen reproduces d3 piecewise color interpolation via ramp texture", async ({
    page,
}) => {
    // Texture sampling can introduce minor differences versus CPU interpolation.
    await ensureWebGPU(page);

    const input = [0, 2.5, 5, 10, 20, 60, 100];
    const domain = [0, 5, 20, 100];
    const unitRange = normalizeRangePositions(domain.length);
    const colors = ["green", "#0050f8", "#f6f6f6", "#ff3000"];
    const colorScale = scaleLinear()
        .domain(domain)
        .range(colors)
        .interpolate(interpolateHcl);
    const textureData = createSchemeTexture({
        scheme: colors,
        mode: "interpolate",
        interpolate: interpolateHcl,
        count: 1024,
    });
    if (!textureData) {
        throw new Error("Failed to create a piecewise color ramp texture.");
    }

    const codegenFn = buildScaleFn({
        scale: "linear",
        scaleConfig: { type: "linear", domain, range: unitRange },
    });
    const shaderCode = buildScaleCodegenRampShader({
        scaleFn: codegenFn,
        inputLength: input.length,
        domainLength: domain.length,
        rangeLength: unitRange.length,
    });
    const result = await runScaleCodegenRampCompute(page, {
        shaderCode,
        input,
        uniformData: packPiecewiseDomainRange(domain, unitRange),
        texture: packTextureData(textureData),
    });

    expect(result).toHaveLength(input.length * 4);
    input.forEach((value, index) => {
        const expected = d3color(colorScale(value)).rgb();
        const base = index * 4;
        expect(result[base]).toBeCloseTo(expected.r / 255, 2);
        expect(result[base + 1]).toBeCloseTo(expected.g / 255, 2);
        expect(result[base + 2]).toBeCloseTo(expected.b / 255, 2);
        expect(result[base + 3]).toBeCloseTo(1, 5);
    });
});
