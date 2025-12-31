import { test, expect } from "@playwright/test";
import { scaleLinear, scaleLog, scalePow, scaleSymlog } from "d3-scale";
import SCALES_WGSL from "../src/wgsl/scales.wgsl.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;

/**
 * @param {string} scaleExpr
 * @param {number} inputLength
 * @returns {string}
 */
function buildComputeShader(scaleExpr, inputLength) {
    return `
${SCALES_WGSL}

struct Params {
    domain: vec2<f32>,
    range: vec2<f32>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let v = input[i];
    output[i] = ${scaleExpr};
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
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: { buffer: inputBuffer } },
                    { binding: 2, resource: { buffer: outputBuffer } },
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
