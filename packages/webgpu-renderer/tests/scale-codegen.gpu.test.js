import { test, expect } from "@playwright/test";
import { scaleLinear, scaleThreshold } from "d3-scale";
import SCALES_WGSL from "../src/wgsl/scales.wgsl.js";
import { buildScaledFunction } from "../src/marks/scaleCodegen.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;

/**
 * @param {object} params
 * @param {string} params.scaleFn
 * @param {number} params.inputLength
 * @param {1|4} [params.outputComponents]
 * @param {number} [params.domainLength]
 * @param {number} [params.rangeLength]
 * @returns {string}
 */
function buildScaleCodegenShader({
    scaleFn,
    inputLength,
    outputComponents = 1,
    domainLength = 2,
    rangeLength = 2,
}) {
    const outputType = outputComponents === 1 ? "f32" : "vec4<f32>";
    return `
${SCALES_WGSL}

struct Params {
    uDomain_x: array<vec4<f32>, ${domainLength}>,
    uRange_x: array<vec4<f32>, ${rangeLength}>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<${outputType}>;

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
function packContinuousDomainRange(domain, range) {
    const data = new Float32Array(16);
    data[0] = domain[0];
    data[4] = domain[1];
    data[8] = range[0];
    data[12] = range[1];
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
    const codegenFn = buildScaledFunction({
        name: "x",
        scale: "threshold",
        rawValueExpr: "input[i]",
        scalarType: "f32",
        outputComponents: 4,
        outputScalarType: "f32",
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
