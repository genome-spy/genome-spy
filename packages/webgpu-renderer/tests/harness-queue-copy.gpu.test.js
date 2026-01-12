/**
 * Verifies the Playwright harness can write a buffer, copy it, and map it
 * back, ensuring the low-level queue operations work before shader tests.
 */
import { test, expect } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("GPU queue write/copy renders buffer data", async ({ page }) => {
    await ensureWebGPU(page);
    const data = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error(
                "WebGPU adapter is unavailable in the page context."
            );
        }
        const device = await adapter.requestDevice();
        const payload = new Float32Array([0.25, 0.5, 0.75]);
        const bufferSize = payload.byteLength;

        const source = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        device.queue.writeBuffer(source, 0, payload);

        const target = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(source, 0, target, 0, bufferSize);
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();

        await target.mapAsync(GPUMapMode.READ);
        const copied = new Float32Array(target.getMappedRange().slice());
        target.unmap();
        return Array.from(copied);
    });

    expect(data).toEqual([0.25, 0.5, 0.75]);
});
