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
