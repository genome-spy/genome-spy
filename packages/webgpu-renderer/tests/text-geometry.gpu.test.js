/* global GPUBufferUsage, GPUMapMode, navigator */

import { expect, test } from "@playwright/test";

import latoRegular from "../src/fonts/Lato-Regular.json" with { type: "json" };
import getMetrics, { SDF_PADDING } from "../src/fonts/bmFontMetrics.js";
import { TEXT_GEOMETRY_WGSL } from "../src/marks/programs/textGeometry.wgsl.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const BASELINES = [0, 1, 2, 3];

test("text glyph vertices honor BMFont bearings and baseline modes", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const metrics = getMetrics(latoRegular);
    const glyphs = [metrics.getChar("0"), metrics.getChar(".")];
    const inputs = glyphs.flatMap((glyph) =>
        BASELINES.flatMap((baseline) => [
            [0, glyph.height, glyph.yoffset, baseline],
            [1, glyph.height, glyph.yoffset, baseline],
        ])
    );
    const fontSize = 12;
    const sizeScale = fontSize / metrics.common.base;

    const actual = await page.evaluate(
        async ({ shaderFunctions, inputs, uniforms }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("No WebGPU adapter available.");
            }
            const device = await adapter.requestDevice();
            const inputData = new Float32Array(inputs.flat());
            const outputSize = inputs.length * 4;
            const inputBuffer = device.createBuffer({
                size: inputData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            const outputBuffer = device.createBuffer({
                size: outputSize,
                usage:
                    GPUBufferUsage.STORAGE |
                    GPUBufferUsage.COPY_SRC |
                    GPUBufferUsage.COPY_DST,
            });
            const readback = device.createBuffer({
                size: outputSize,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            device.queue.writeBuffer(inputBuffer, 0, inputData);

            const module = device.createShaderModule({
                code: `
${shaderFunctions}

struct Input {
    vertexY: f32,
    glyphHeight: f32,
    glyphYOffset: f32,
    baseline: f32,
};

@group(0) @binding(0) var<storage, read> inputs: array<Input>;
@group(0) @binding(1) var<storage, read_write> outputs: array<f32>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    let input = inputs[i];
    outputs[i] = glyphVertexY(
        input.vertexY,
        0.0,
        input.glyphHeight,
        input.glyphYOffset,
        ${uniforms.sizeScale},
        1.0,
        u32(input.baseline),
        ${uniforms.sdfPadding},
        ${uniforms.capHeight},
        ${uniforms.descent}
    );
}
`,
            });
            const pipeline = device.createComputePipeline({
                layout: "auto",
                compute: { module, entryPoint: "main" },
            });
            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: inputBuffer } },
                    { binding: 1, resource: { buffer: outputBuffer } },
                ],
            });
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(inputs.length);
            pass.end();
            encoder.copyBufferToBuffer(
                outputBuffer,
                0,
                readback,
                0,
                outputSize
            );
            device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const result = Array.from(
                new Float32Array(readback.getMappedRange().slice())
            );
            readback.unmap();
            return result;
        },
        {
            shaderFunctions: TEXT_GEOMETRY_WGSL,
            inputs,
            uniforms: {
                sizeScale,
                sdfPadding: SDF_PADDING,
                capHeight: metrics.capHeight,
                descent: metrics.descent,
            },
        }
    );

    const expected = inputs.map(([vertexY, height, yOffset, baseline]) => {
        let baselineOffset = -SDF_PADDING;
        if (baseline == 1) {
            baselineOffset += metrics.capHeight * 0.5;
        } else if (baseline == 2) {
            baselineOffset += metrics.capHeight;
        } else if (baseline == 3) {
            baselineOffset -= metrics.descent;
        }
        return (yOffset + baselineOffset + vertexY * height) * sizeScale;
    });

    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, index) => {
        expect(value).toBeCloseTo(expected[index], 4);
    });

    const alphabeticZero = actual.slice(0, 2);
    const alphabeticPeriod = actual.slice(8, 10);
    expect(alphabeticZero[0]).toBeLessThan(alphabeticPeriod[0]);
    expect(Math.abs(alphabeticZero[1] - alphabeticPeriod[1])).toBeLessThan(
        0.25
    );
});
