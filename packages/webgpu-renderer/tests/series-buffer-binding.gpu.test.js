/* global console, navigator, process */

/**
 * Copies the generated `seriesF32` buffer directly to output to prove the
 * compute-binding layout matches the renderer's expected buffer.
 */
import { test, expect } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";
import { runSeriesCopyCase } from "./scaleShaderTestUtils.js";

test("seriesF32 binding exposes raw input data", async ({ page }) => {
    await ensureWebGPU(page);
    if (process.env.SCALE_TEST_LOG_BUFFERS === "1") {
        page.on("console", (msg) => console.log("PAGE:", msg.text()));
    }
    const input = [0.1, 0.2, 0.3, 0.4];
    const channels = {
        x: {
            data: new Float32Array(input),
            type: "f32",
            components: 1,
        },
    };
    const output = await runSeriesCopyCase(page, {
        channels,
        channelName: "x",
        outputType: "f32",
        outputLength: input.length,
        outputComponents: 1,
    });

    expect(output).toHaveLength(input.length);
    output.forEach((value, index) => {
        expect(value).toBeCloseTo(input[index], 5);
    });
});

test("empty series use a valid minimum-sized GPU buffer", async ({ page }) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const { SeriesBufferManager } =
            await import("/src/marks/programs/internal/seriesBuffers.js");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("WebGPU adapter unavailable.");
        }
        const device = await adapter.requestDevice();
        const data = new Float32Array(0);
        const channels = {
            x: { data, type: "f32", components: 1 },
        };

        device.pushErrorScope("validation");
        const manager = new SeriesBufferManager(device, channels, {});
        manager.updateSeries({ x: data }, 0);
        await device.queue.onSubmittedWorkDone();
        const error = await device.popErrorScope();
        const buffer = manager.getBuffer("seriesF32");
        const size = buffer?.size ?? 0;
        buffer?.destroy();
        device.destroy();
        return { error: error?.message ?? null, size };
    });

    expect(result).toEqual({ error: null, size: 4 });
});
