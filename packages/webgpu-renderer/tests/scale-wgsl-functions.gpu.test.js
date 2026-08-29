/* global navigator, GPUBufferUsage, GPUMapMode */

/*
 * GPU tests for the low-level WGSL scale functions. These validate the raw
 * WGSL helpers independent of codegen and higher-level resource wiring.
 */

import { test, expect } from "@playwright/test";
import {
    scaleBand,
    scaleLinear,
    scaleLog,
    scalePow,
    scaleSqrt,
    scaleSymlog,
} from "d3-scale";
import { buildScaleWgsl } from "../src/marks/scales/scaleWgsl.js";
import { getTestScaleDefinitions } from "../testUtils/scaleDefinitions.js";
import {
    BASE,
    packHighPrecisionDomain,
    packHighPrecisionU32Array,
} from "../src/utils/highPrecision.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;
const LOW_MASK = BASE - 1;
const f32 = Math.fround;
const ALL_SCALE_DEFINITIONS = getTestScaleDefinitions();

/**
 * @param {number} value
 * @returns {[number, number]}
 */
function splitUint(value) {
    const lo = value & LOW_MASK;
    const hi = value - lo;
    return [hi, lo];
}

/**
 * @param {object} params
 * @param {number} params.value
 * @param {[number, number, number]} params.domainExtent
 * @param {[number, number]} params.range
 * @param {[number, number, number, number]} params.config
 * @returns {number}
 */
function computeBandHpExpected({ value, domainExtent, range, config }) {
    const [paddingInner, paddingOuter, align, band] = config;
    const reverse = range[1] < range[0];
    const start = f32(reverse ? range[1] : range[0]);
    const stop = f32(reverse ? range[0] : range[1]);
    const rangeSpan = f32(stop - start);
    const domainStartHi = f32(domainExtent[0]);
    const domainStartLo = f32(domainExtent[1]);
    const n = f32(domainExtent[2]);
    const step = f32(
        rangeSpan / Math.max(1, n - paddingInner + paddingOuter * 2)
    );
    const alignedStart = f32(
        start + f32((rangeSpan - step * (n - paddingInner)) * align)
    );
    const bandwidth = f32(step * (1 - paddingInner));
    const [hi, lo] = splitUint(value);
    const deltaHi = f32(f32(hi) - domainStartHi);
    const deltaLo = f32(f32(lo) - domainStartLo);
    if (reverse) {
        const reverseStart = f32(alignedStart + f32((n - 1) * step));
        return f32(
            reverseStart -
                f32(deltaHi * step) -
                f32(deltaLo * step) +
                f32(bandwidth * band)
        );
    }
    return f32(
        alignedStart +
            f32(deltaHi * step) +
            f32(deltaLo * step) +
            f32(bandwidth * band)
    );
}

/**
 * @param {object} params
 * @param {[number, number]} params.value
 * @param {[number, number, number]} params.domainExtent
 * @param {[number, number]} params.range
 * @param {[number, number, number, number]} params.config
 * @returns {number}
 */
function computeBandHpUExpected({ value, domainExtent, range, config }) {
    const [paddingInner, paddingOuter, align, band] = config;
    const reverse = range[1] < range[0];
    const start = f32(reverse ? range[1] : range[0]);
    const stop = f32(reverse ? range[0] : range[1]);
    const rangeSpan = f32(stop - start);
    const domainStartHi = f32(domainExtent[0]);
    const domainStartLo = f32(domainExtent[1]);
    const n = f32(domainExtent[2]);
    const step = f32(
        rangeSpan / Math.max(1, n - paddingInner + paddingOuter * 2)
    );
    const alignedStart = f32(
        start + f32((rangeSpan - step * (n - paddingInner)) * align)
    );
    const bandwidth = f32(step * (1 - paddingInner));
    const deltaHi = f32(f32(value[0] * BASE) - domainStartHi);
    const deltaLo = f32(f32(value[1]) - domainStartLo);
    if (reverse) {
        const reverseStart = f32(alignedStart + f32((n - 1) * step));
        return f32(
            reverseStart -
                f32(deltaHi * step) -
                f32(deltaLo * step) +
                f32(bandwidth * band)
        );
    }
    return f32(
        alignedStart +
            f32(deltaHi * step) +
            f32(deltaLo * step) +
            f32(bandwidth * band)
    );
}

/**
 * @param {string} scaleExpr
 * @param {number} inputLength
 * @returns {string}
 */
function buildComputeShader(scaleExpr, inputLength) {
    const scalesWgsl = buildScaleWgsl(ALL_SCALE_DEFINITIONS);
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
    const scalesWgsl = buildScaleWgsl(ALL_SCALE_DEFINITIONS);
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
    const scalesWgsl = buildScaleWgsl(ALL_SCALE_DEFINITIONS);
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
 * @param {number} inputLength
 * @returns {string}
 */
function buildBandComputeShader(inputLength) {
    const scalesWgsl = buildScaleWgsl(ALL_SCALE_DEFINITIONS);
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
    paddingInner: f32,
    paddingOuter: f32,
    align: f32,
    band: f32,
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
    output[i] = scaleBand(
        v,
        params.domain,
        params.range,
        params.paddingInner,
        params.paddingOuter,
        params.align,
        params.band
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
 * @param {[number, number]} params.domain
 * @param {[number, number]} params.range
 * @param {number} params.paddingInner
 * @param {number} params.paddingOuter
 * @param {number} params.align
 * @param {number} params.band
 * @returns {Promise<number[]>}
 */
async function runBandScaleCompute(
    page,
    {
        shaderCode,
        input,
        domain,
        range,
        paddingInner,
        paddingOuter,
        align,
        band,
    }
) {
    return page.evaluate(
        async ({
            shaderCode,
            input,
            domain,
            range,
            paddingInner,
            paddingOuter,
            align,
            band,
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
                range[0],
                range[1],
                paddingInner,
                paddingOuter,
                align,
                band,
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
        {
            shaderCode,
            input,
            domain,
            range,
            paddingInner,
            paddingOuter,
            align,
            band,
            workgroupSize: WORKGROUP_SIZE,
        }
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
/**
 * @typedef {object} ContinuousScaleCase
 * @property {string} name
 * @property {number[]} input
 * @property {number[]} domain
 * @property {number[]} range
 * @property {string} scaleExpr
 * @property {(domain: number[], range: number[]) => (value: number) => number | undefined} createReference
 * @property {number} [tolerance]
 */

/** @type {ContinuousScaleCase[]} */
const CONTINUOUS_SCALE_CASES = [
    {
        name: "linear maps and extrapolates through a reversed range",
        input: [-8, -4, 0, 6, 10],
        domain: [-4, 6],
        range: [20, -10],
        scaleExpr: "scaleLinear(v, params.domain, params.range)",
        createReference: (domain, range) =>
            scaleLinear().domain(domain).range(range),
    },
    {
        name: "linear supports a reversed domain",
        input: [-8, -4, 0, 6, 10],
        domain: [6, -4],
        range: [-10, 20],
        scaleExpr: "scaleLinear(v, params.domain, params.range)",
        createReference: (domain, range) =>
            scaleLinear().domain(domain).range(range),
    },
    {
        name: "linear maps a degenerate domain to the range midpoint",
        input: [-1, 2, 10],
        domain: [2, 2],
        range: [-5, 9],
        scaleExpr: "scaleLinear(v, params.domain, params.range)",
        createReference: (domain, range) =>
            scaleLinear().domain(domain).range(range),
    },
    {
        name: "pow preserves sign with a non-default exponent",
        input: [-6, -3, -1, 0, 2, 5],
        domain: [-3, 5],
        range: [12, -4],
        scaleExpr: "scalePow(v, params.domain, params.range, 2.0)",
        createReference: (domain, range) =>
            scalePow().domain(domain).range(range).exponent(2),
    },
    {
        name: "sqrt preserves sign across a reversed domain",
        input: [-9, -4, 0, 4, 16],
        domain: [16, -9],
        range: [-3, 7],
        scaleExpr: "scalePow(v, params.domain, params.range, 0.5)",
        createReference: (domain, range) =>
            scaleSqrt().domain(domain).range(range),
    },
    {
        name: "log maps a positive domain with a non-default base",
        input: [0.0625, 0.125, 1, 8, 64, 128],
        domain: [0.125, 64],
        range: [5, -3],
        scaleExpr: "scaleLog(v, params.domain, params.range, 2.0)",
        createReference: (domain, range) =>
            scaleLog().domain(domain).range(range).base(2),
        tolerance: 5e-5,
    },
    {
        name: "log maps a reversed positive domain with base e",
        input: [0.25, 0.5, 1, 4, 32, 64],
        domain: [32, 0.5],
        range: [-7, 11],
        scaleExpr: "scaleLog(v, params.domain, params.range, 2.718281828)",
        createReference: (domain, range) =>
            scaleLog().domain(domain).range(range).base(Math.E),
        tolerance: 5e-5,
    },
    {
        name: "log maps a wholly negative reversed domain",
        input: [-0.5, -1, -10, -100, -1000, -2000],
        domain: [-1, -1000],
        range: [4, -2],
        scaleExpr: "scaleLog(v, params.domain, params.range, 10.0)",
        createReference: (domain, range) =>
            scaleLog().domain(domain).range(range).base(10),
        tolerance: 5e-5,
    },
    {
        name: "symlog maps an asymmetric domain with a custom constant",
        input: [-200, -20, -0.5, 0, 1, 30, 80],
        domain: [-100, 30],
        range: [20, -5],
        scaleExpr: "scaleSymlog(v, params.domain, params.range, 0.5)",
        createReference: (domain, range) =>
            scaleSymlog().domain(domain).range(range).constant(0.5),
        tolerance: 5e-5,
    },
    {
        name: "symlog retains precision around zero",
        input: [-0.0002, -0.00001, -0.000001, 0, 0.000001, 0.00001, 0.0004],
        domain: [-0.0001, 0.0002],
        range: [-1, 1],
        scaleExpr: "scaleSymlog(v, params.domain, params.range, 1.0)",
        createReference: (domain, range) =>
            scaleSymlog().domain(domain).range(range).constant(1),
        tolerance: 5e-5,
    },
];

for (const scaleCase of CONTINUOUS_SCALE_CASES) {
    test(`WGSL ${scaleCase.name} like d3`, async ({ page }) => {
        await ensureWebGPU(page);

        const input = scaleCase.input.map(Math.fround);
        const domain = scaleCase.domain.map(Math.fround);
        const range = scaleCase.range.map(Math.fround);
        const reference = scaleCase.createReference(domain, range);
        const shaderCode = buildComputeShader(
            scaleCase.scaleExpr,
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
            const expected = reference(value);
            expect(expected).not.toBeUndefined();
            const tolerance =
                (scaleCase.tolerance ?? 1e-5) *
                Math.max(1, Math.abs(expected ?? 0));
            expect(
                Math.abs(result[index] - (expected ?? 0))
            ).toBeLessThanOrEqual(tolerance);
        });
    });
}

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
        { start: start + 0.001, span: 2.5 },
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

        values.forEach((value, index) => {
            const expected = computeBandHpExpected({
                value,
                domainExtent: domain,
                range,
                config,
            });
            expect(result[index]).toBeCloseTo(expected, 1);
        });
    }
});

test("scaleBandHp preserves adjacent genomic endpoints", async ({ page }) => {
    await ensureWebGPU(page);

    const values = [2_470_387_217, 2_470_387_218];
    const range = [0, 960];
    const config = [0, 0, 0, 0];
    const domain = packHighPrecisionDomain(2_470_387_120, 2_470_387_355);
    const result = await runBandCompute(page, {
        shaderCode: buildBandHpComputeShader(values.length),
        input: values,
        domain,
        range,
        config,
    });

    expect(result[1] - result[0]).toBeCloseTo(960 / 235, 4);
    values.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(
            computeBandHpExpected({
                value,
                domainExtent: domain,
                range,
                config,
            }),
            1
        );
    });
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
        { start: start + 0.005, span: 3.75 },
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

        values.forEach((_, index) => {
            const packedIndex = index * 2;
            const expected = computeBandHpUExpected({
                value: [packed[packedIndex], packed[packedIndex + 1]],
                domainExtent: domain,
                range,
                config,
            });
            expect(result[index]).toBeCloseTo(expected, 1);
        });
    }
});

test("scaleBand matches d3 band positions with padding/align", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [0, 1, 2, 3];
    const domain = [0, 4];
    const range = [0, 100];
    const paddingInner = 0.2;
    const paddingOuter = 0.1;
    const align = 0.3;
    const band = 0;
    const reference = scaleBand()
        .domain(input.map(String))
        .range(range)
        .paddingInner(paddingInner)
        .paddingOuter(paddingOuter)
        .align(align);

    const shaderCode = buildBandComputeShader(input.length);
    const result = await runBandScaleCompute(page, {
        shaderCode,
        input,
        domain,
        range,
        paddingInner,
        paddingOuter,
        align,
        band,
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        const expected = reference(String(value));
        expect(result[index]).toBeCloseTo(expected ?? 0, 5);
    });
});

test("scaleBand honors the band offset parameter", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [0, 1, 2];
    const domain = [0, 3];
    const range = [0, 90];
    const paddingInner = 0;
    const paddingOuter = 0;
    const align = 0.5;
    const band = 1;
    const reference = scaleBand()
        .domain(input.map(String))
        .range(range)
        .paddingInner(paddingInner)
        .paddingOuter(paddingOuter)
        .align(align);

    const shaderCode = buildBandComputeShader(input.length);
    const result = await runBandScaleCompute(page, {
        shaderCode,
        input,
        domain,
        range,
        paddingInner,
        paddingOuter,
        align,
        band,
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        const start = reference(String(value)) ?? 0;
        const expected = start + reference.bandwidth();
        expect(result[index]).toBeCloseTo(expected, 5);
    });
});

test("scaleBand supports reverse ranges with non-zero domain starts", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [10, 11, 12];
    const domain = [10, 13];
    const range = [120, 20];
    const paddingInner = 0.15;
    const paddingOuter = 0.05;
    const align = 0.7;
    const band = 0;
    const reference = scaleBand()
        .domain(input.map(String))
        .range(range)
        .paddingInner(paddingInner)
        .paddingOuter(paddingOuter)
        .align(align);

    const shaderCode = buildBandComputeShader(input.length);
    const result = await runBandScaleCompute(page, {
        shaderCode,
        input,
        domain,
        range,
        paddingInner,
        paddingOuter,
        align,
        band,
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        const expected = reference(String(value));
        expect(result[index]).toBeCloseTo(expected ?? 0, 5);
    });
});

test("scaleBand matches d3 at alignment extremes and fractional band positions", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [4, 5, 6, 7, 8];
    const domain = [4, 9];
    const cases = [
        {
            range: [-20, 140],
            paddingInner: 0.35,
            paddingOuter: 0.4,
            align: 0,
            band: 0.5,
        },
        {
            range: [140, -20],
            paddingInner: 0.7,
            paddingOuter: 0.15,
            align: 1,
            band: 0.25,
        },
    ];

    for (const bandCase of cases) {
        const reference = scaleBand()
            .domain(input.map(String))
            .range(bandCase.range)
            .paddingInner(bandCase.paddingInner)
            .paddingOuter(bandCase.paddingOuter)
            .align(bandCase.align);
        const result = await runBandScaleCompute(page, {
            shaderCode: buildBandComputeShader(input.length),
            input,
            domain,
            ...bandCase,
        });

        input.forEach((value, index) => {
            const start = reference(String(value)) ?? 0;
            const expected = start + reference.bandwidth() * bandCase.band;
            expect(result[index]).toBeCloseTo(expected, 4);
        });
    }
});

test("scaleBand ignores inner padding for a singleton domain by design", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const input = [5];
    const range = [0, 100];
    const paddingOuter = 0.2;
    const align = 0.75;
    const band = 0.5;
    const reference = scaleBand()
        .domain(["5"])
        .range(range)
        .paddingInner(0)
        .paddingOuter(paddingOuter)
        .align(align);
    const result = await runBandScaleCompute(page, {
        shaderCode: buildBandComputeShader(input.length),
        input,
        domain: [5, 6],
        range,
        paddingInner: 0.8,
        paddingOuter,
        align,
        band,
    });

    const expected = (reference("5") ?? 0) + reference.bandwidth() * band;
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(expected, 5);
});
