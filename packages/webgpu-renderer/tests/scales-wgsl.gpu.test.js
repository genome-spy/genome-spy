import { test, expect } from "@playwright/test";
import { scaleLinear, scaleLog, scalePow, scaleSymlog } from "d3-scale";
import getScaleWgsl from "../src/wgsl/scales.wgsl.js";
import {
    packHighPrecisionDomain,
    packHighPrecisionU32Array,
} from "../src/utils/highPrecision.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;

/**
 * @param {string} scaleExpr
 * @param {number} inputLength
 * @returns {string}
 */
function buildComputeShader(scaleExpr, inputLength) {
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
    domain: vec2<f32>,
    range: vec2<f32>,
};

@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> input: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let guard = globals.uZero;
    let v = input[i];
    output[i] = ${scaleExpr} + guard;
}
`;
}

/**
 * @param {number} inputLength
 * @returns {string}
 */
function buildBandHpComputeShader(inputLength) {
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
    domain: vec4<f32>,
    range: vec4<f32>,
    config: vec4<f32>,
};

@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> input: array<u32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let guard = globals.uZero;
    let v = input[i];
    output[i] = scaleBandHp(
        v,
        params.domain.xyz,
        params.range.xy,
        params.config.x,
        params.config.y,
        params.config.z,
        params.config.w
    ) + guard;
}
`;
}

/**
 * @param {number} inputLength
 * @returns {string}
 */
function buildBandHpUComputeShader(inputLength) {
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
    domain: vec4<f32>,
    range: vec4<f32>,
    config: vec4<f32>,
};

@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> input: array<u32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let guard = globals.uZero;
    let base = i * 2u;
    let v = vec2<u32>(input[base], input[base + 1u]);
    output[i] = scaleBandHpU(
        v,
        params.domain.xyz,
        params.range.xy,
        params.config.x,
        params.config.y,
        params.config.z,
        params.config.w
    ) + guard;
}
`;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ shaderCode: string, input: number[], domain: [number, number], range: [number, number] }} params
 * @returns {Promise<number[]>}
 */
async function runScaleCompute(page, { shaderCode, input, domain, range }) {
    return page.evaluate(
        async ({ shaderCode, input, domain, range, workgroupSize }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("WebGPU adapter is not available.");
            }
            const device = await adapter.requestDevice();

            const inputData = new Float32Array(input);
            const globalsData = new Float32Array([1, 1, 1, 0]);
            const uniformData = new Float32Array([
                domain[0],
                domain[1],
                range[0],
                range[1],
            ]);

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
                size: uniformData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(uniformBuffer, 0, uniformData);

            const inputBuffer = device.createBuffer({
                size: inputData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(inputBuffer, 0, inputData);

            const outputBuffer = device.createBuffer({
                size: inputData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const readBuffer = device.createBuffer({
                size: inputData.byteLength,
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
                inputData.byteLength
            );
            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();

            await readBuffer.mapAsync(GPUMapMode.READ);
            const mapped = readBuffer.getMappedRange();
            const copy = new Float32Array(mapped.slice(0));
            readBuffer.unmap();

            return Array.from(copy);
        },
        { shaderCode, input, domain, range, workgroupSize: WORKGROUP_SIZE }
    );
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {object} params
 * @param {string} params.shaderCode
 * @param {number[]} params.input
 * @param {1|2} [params.inputComponents]
 * @param {[number, number, number]} params.domain
 * @param {[number, number]} params.range
 * @param {[number, number, number, number]} params.config
 * @returns {Promise<number[]>}
 */
async function runBandCompute(
    page,
    { shaderCode, input, inputComponents = 1, domain, range, config }
) {
    return page.evaluate(
        async ({
            shaderCode,
            input,
            inputComponents,
            domain,
            range,
            config,
            workgroupSize,
        }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("WebGPU adapter is not available.");
            }
            const device = await adapter.requestDevice();

            const inputData = new Uint32Array(input);
            const globalsData = new Float32Array([1, 1, 1, 0]);
            const uniformData = new Float32Array([
                domain[0],
                domain[1],
                domain[2],
                0,
                range[0],
                range[1],
                0,
                0,
                config[0],
                config[1],
                config[2],
                config[3],
            ]);

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
                size: uniformData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(uniformBuffer, 0, uniformData);

            const inputBuffer = device.createBuffer({
                size: inputData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(inputBuffer, 0, inputData);

            const outputCount = input.length / inputComponents;
            const outputSize = outputCount * 4;
            const outputBuffer = device.createBuffer({
                size: outputSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const readBuffer = device.createBuffer({
                size: outputSize,
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
            pass.dispatchWorkgroups(Math.ceil(outputCount / workgroupSize));
            pass.end();

            encoder.copyBufferToBuffer(
                outputBuffer,
                0,
                readBuffer,
                0,
                outputSize
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
            inputComponents,
            domain,
            range,
            config,
            workgroupSize: WORKGROUP_SIZE,
        }
    );
}
test("scaleLinear matches CPU reference", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [0, 0.5, 1];
    const reference = scaleLinear().domain([0, 1]).range([0, 10]);
    const shaderCode = buildComputeShader(
        "scaleLinear(v, params.domain, params.range)",
        input.length
    );
    const result = await runScaleCompute(page, {
        shaderCode,
        input,
        domain: [0, 1],
        range: [0, 10],
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scalePow matches CPU reference", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [0, 0.5, 1];
    const reference = scalePow().domain([0, 1]).range([0, 1]).exponent(2);
    const shaderCode = buildComputeShader(
        "scalePow(v, params.domain, params.range, 2.0)",
        input.length
    );
    const result = await runScaleCompute(page, {
        shaderCode,
        input,
        domain: [0, 1],
        range: [0, 1],
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scaleLog matches CPU reference", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [1, 10, 100];
    const domain = [1, 100];
    const range = [0, 1];
    const base = 10;
    const reference = scaleLog().domain(domain).range(range).base(base);
    const shaderCode = buildComputeShader(
        `scaleLog(v, params.domain, params.range, ${base}.0)`,
        input.length
    );
    const result = await runScaleCompute(page, {
        shaderCode,
        input,
        domain,
        range,
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scaleSymlog matches CPU reference", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [-10, 0, 10];
    const domain = [-10, 10];
    const range = [0, 1];
    const constant = 1;
    const reference = scaleSymlog()
        .domain(domain)
        .range(range)
        .constant(constant);
    const shaderCode = buildComputeShader(
        `scaleSymlog(v, params.domain, params.range, ${constant}.0)`,
        input.length
    );
    const result = await runScaleCompute(page, {
        shaderCode,
        input,
        domain,
        range,
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});

test("scaleBandHp matches CPU reference for large u32 indices", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const start = 2_000_000_000;
    const values = [start, start + 250, start + 750];
    const range = [0, 800];
    const config = [0, 0, 0, 0];
    const shaderCode = buildBandHpComputeShader(values.length);
    const domains = [
        { start: start - 0.4, span: 1000 },
        { start: start + 0.25, span: 975.5 },
    ];

    for (const { start: domainStart, span } of domains) {
        const domain = packHighPrecisionDomain(domainStart, domainStart + span);
        const result = await runBandCompute(page, {
            shaderCode,
            input: values,
            domain,
            range,
            config,
        });

        const step = (range[1] - range[0]) / span;
        values.forEach((value, index) => {
            const expected = range[0] + (value - domainStart) * step;
            expect(result[index]).toBeCloseTo(expected, 3);
        });
    }
});

test("scaleBandHpU matches CPU reference with packed large indices", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const start = 100_000_000_000;
    const values = [start, start + 250, start + 750];
    const packed = packHighPrecisionU32Array(values);
    const range = [0, 800];
    const config = [0, 0, 0, 0];
    const shaderCode = buildBandHpUComputeShader(values.length);
    const domains = [
        { start: start - 0.65, span: 1200 },
        { start: start + 0.125, span: 950.25 },
    ];

    for (const { start: domainStart, span } of domains) {
        const domain = packHighPrecisionDomain(domainStart, domainStart + span);
        const result = await runBandCompute(page, {
            shaderCode,
            input: Array.from(packed),
            inputComponents: 2,
            domain,
            range,
            config,
        });

        const step = (range[1] - range[0]) / span;
        values.forEach((value, index) => {
            const expected = range[0] + (value - domainStart) * step;
            expect(result[index]).toBeCloseTo(expected, 3);
        });
    }
});
