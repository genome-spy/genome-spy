import { test, expect } from "@playwright/test";
import { scaleLinear } from "d3-scale";
import SCALES_WGSL from "../src/wgsl/scales.wgsl.js";
import { buildScaledFunction } from "../src/marks/scaleCodegen.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;

/**
 * @param {string} scaleFn
 * @param {number} inputLength
 * @returns {string}
 */
function buildScaleCodegenShader(scaleFn, inputLength) {
    return `
${SCALES_WGSL}

struct Params {
    uDomain_x: array<vec4<f32>, 2>,
    uRange_x: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

${scaleFn}

const INPUT_LEN: u32 = ${inputLength}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    output[i] = getScaled_x(i);
}
`;
}

/**
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {number[]}
 */
function packDomainRange(domain, range) {
    const data = new Float32Array(16);
    data[0] = domain[0];
    data[4] = domain[1];
    data[8] = range[0];
    data[12] = range[1];
    return Array.from(data);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ shaderCode: string, input: number[], uniformData: number[] }} params
 * @returns {Promise<number[]>}
 */
async function runScaleCodegenCompute(
    page,
    { shaderCode, input, uniformData }
) {
    return page.evaluate(
        async ({ shaderCode, input, uniformData, workgroupSize }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("WebGPU adapter is not available.");
            }
            const device = await adapter.requestDevice();

            const inputData = new Float32Array(input);
            const packedUniforms = new Float32Array(uniformData);

            const shaderModule = device.createShaderModule({
                code: shaderCode,
            });
            const pipeline = device.createComputePipeline({
                layout: "auto",
                compute: { module: shaderModule, entryPoint: "main" },
            });

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
        { shaderCode, input, uniformData, workgroupSize: WORKGROUP_SIZE }
    );
}

test("scaleCodegen emits WGSL that executes", async ({ page }) => {
    await ensureWebGPU(page);

    const input = [0, 0.5, 1];
    const domain = [0, 1];
    const range = [0, 10];
    const reference = scaleLinear().domain(domain).range(range);
    const codegenFn = buildScaledFunction({
        name: "x",
        scale: "linear",
        rawValueExpr: "input[i]",
        scalarType: "f32",
        outputComponents: 1,
        outputScalarType: "f32",
        scaleConfig: { type: "linear" },
    });
    const shaderCode = buildScaleCodegenShader(codegenFn, input.length);
    const result = await runScaleCodegenCompute(page, {
        shaderCode,
        input,
        uniformData: packDomainRange(domain, range),
    });

    expect(result).toHaveLength(input.length);
    input.forEach((value, index) => {
        expect(result[index]).toBeCloseTo(reference(value), 5);
    });
});
