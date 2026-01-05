import { expect, test } from "@playwright/test";
import HASH_TABLE_WGSL from "../src/wgsl/hashTable.wgsl.js";
import {
    buildHashTableMap,
    buildHashTableSet,
    HASH_EMPTY_KEY,
} from "../src/utils/hashTable.js";
import { ensureWebGPU } from "./gpuTestUtils.js";

const WORKGROUP_SIZE = 64;

const buildHashLookupShader = (inputLength, maxProbes) => `
${HASH_TABLE_WGSL}

@group(0) @binding(0) var<storage, read> hashEntries: array<HashEntry>;
@group(0) @binding(1) var<storage, read> input: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;

const INPUT_LEN: u32 = ${inputLength}u;
const MAX_PROBES: u32 = ${maxProbes}u;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= INPUT_LEN) {
        return;
    }
    let key = input[i];
    output[i] = hashLookup(&hashEntries, key, MAX_PROBES);
}
`;

/**
 * @param {import("@playwright/test").Page} page
 * @param {object} params
 * @param {string} params.shaderCode
 * @param {number[]} params.table
 * @param {number[]} params.input
 * @returns {Promise<number[]>}
 */
async function runHashCompute(page, { shaderCode, table, input }) {
    return page.evaluate(
        async ({ shaderCode, table, input, workgroupSize }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("WebGPU adapter is not available.");
            }
            const device = await adapter.requestDevice();

            const tableData = new Uint32Array(table);
            const inputData = new Uint32Array(input);

            const tableBuffer = device.createBuffer({
                size: tableData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(tableBuffer, 0, tableData);

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

            const shaderModule = device.createShaderModule({
                code: shaderCode,
            });
            const pipeline = device.createComputePipeline({
                layout: "auto",
                compute: { module: shaderModule, entryPoint: "main" },
            });

            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: tableBuffer } },
                    { binding: 1, resource: { buffer: inputBuffer } },
                    { binding: 2, resource: { buffer: outputBuffer } },
                ],
            });

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(Math.ceil(input.length / workgroupSize));
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
            const copy = new Uint32Array(mapped.slice(0));
            readBuffer.unmap();

            return Array.from(copy);
        },
        { shaderCode, table, input, workgroupSize: WORKGROUP_SIZE }
    );
}

test("hash table set lookup resolves membership", async ({ page }) => {
    await ensureWebGPU(page);

    const keys = [1, 7, 123, 2_000_000_000, 3_500_000_000];
    const { table, capacity } = buildHashTableSet(keys);
    const queries = [
        0, 1, 2, 7, 123, 2_000_000_000, 3_500_000_000, 3_999_999_999,
    ];
    const shaderCode = buildHashLookupShader(queries.length, capacity);
    const result = await runHashCompute(page, {
        shaderCode,
        table: Array.from(table),
        input: queries,
    });

    const present = new Set(keys.map((key) => key >>> 0));
    result.forEach((value, index) => {
        const query = queries[index] >>> 0;
        if (present.has(query)) {
            expect(value).toBe(1);
        } else {
            expect(value).toBe(HASH_EMPTY_KEY);
        }
    });
});

test("hash table map lookup returns dense indices", async ({ page }) => {
    await ensureWebGPU(page);

    const entries = [
        [42, 0],
        [7, 1],
        [2_000_000_000, 2],
        [3_700_000_000, 3],
    ];
    const { table, capacity } = buildHashTableMap(entries);
    const queries = [7, 42, 2_000_000_000, 3_700_000_000, 4_000_000_000];
    const shaderCode = buildHashLookupShader(queries.length, capacity);
    const result = await runHashCompute(page, {
        shaderCode,
        table: Array.from(table),
        input: queries,
    });

    const expected = new Map(entries.map(([key, value]) => [key, value]));
    result.forEach((value, index) => {
        const query = queries[index];
        if (expected.has(query)) {
            expect(value).toBe(expected.get(query));
        } else {
            expect(value).toBe(HASH_EMPTY_KEY);
        }
    });
});

test("hash table map lookup tolerates high load factors", async ({ page }) => {
    await ensureWebGPU(page);

    const entries = Array.from({ length: 30 }, (_, i) => [i + 1, i]);
    const { table, capacity } = buildHashTableMap(entries, {
        capacity: 64,
        maxLoadFactor: 0.9,
    });
    const queries = [1, 15, 30, 42];
    const shaderCode = buildHashLookupShader(queries.length, capacity);
    const result = await runHashCompute(page, {
        shaderCode,
        table: Array.from(table),
        input: queries,
    });

    const expected = new Map(entries.map(([key, value]) => [key, value]));
    result.forEach((value, index) => {
        const query = queries[index];
        if (expected.has(query)) {
            expect(value).toBe(expected.get(query));
        } else {
            expect(value).toBe(HASH_EMPTY_KEY);
        }
    });
});
