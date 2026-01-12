/**
 * Confirms `writeBuffer` can populate a `STORAGE` buffer, covering the usage
 * mode needed by scale compute passes.
 */
import { test, expect } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("writeBuffer can fill a storage buffer", async ({ page }) => {
    await ensureWebGPU(page);
    const data = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("No WebGPU adapter available.");
        }
        const device = await adapter.requestDevice();
        const payload = new Float32Array([0.1, 0.2, 0.3]);
        const bufferSize = payload.byteLength;

        const storageBuffer = device.createBuffer({
            size: bufferSize,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_DST |
                GPUBufferUsage.COPY_SRC,
        });
        device.queue.writeBuffer(storageBuffer, 0, payload);

        const readback = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(storageBuffer, 0, readback, 0, bufferSize);
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        await readback.mapAsync(GPUMapMode.READ);
        const copied = new Float32Array(readback.getMappedRange().slice());
        readback.unmap();
        return Array.from(copied);
    });

    expect(data).toHaveLength(3);
    const expected = [0.1, 0.2, 0.3];
    data.forEach((value, index) => {
        expect(value).toBeCloseTo(expected[index], 5);
    });
});
