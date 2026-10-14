/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("negotiated byte capacity supports a 160 MB mixed series with default binding counts", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pointMark }, { identityScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/identity.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        const limits = {
            maxStorageBufferBindingSize:
                renderer.device.limits.maxStorageBufferBindingSize,
            maxBufferSize: renderer.device.limits.maxBufferSize,
            maxStorageBuffersPerShaderStage:
                renderer.device.limits.maxStorageBuffersPerShaderStage,
            maxBindGroups: renderer.device.limits.maxBindGroups,
        };
        if (
            Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize) <
            160000000
        ) {
            renderer.destroy();
            canvas.remove();
            return { supported: false, limits, ids: [] };
        }
        renderer.updateGlobals({ width: 160, height: 100, dpr: 1 });
        const count = 10000000;
        const x = new Float32Array(count);
        const y = new Float32Array(count);
        const size = new Float32Array(count);
        const uniqueId = new Uint32Array(count);
        x[0] = 40;
        x[count - 1] = 100;
        y[0] = y[count - 1] = 50;
        size[0] = size[count - 1] = 100;
        uniqueId[0] = 16777217;
        uniqueId[count - 1] = 4294967294;
        renderer.device.pushErrorScope("validation");
        const mark = renderer.createMark(pointMark, {
            count,
            channels: {
                x: { data: x, type: "f32", scale: identityScale() },
                y: { data: y, type: "f32", scale: identityScale() },
                size: { data: size, type: "f32", scale: identityScale() },
                uniqueId: { data: uniqueId, type: "u32" },
                fill: { value: [0, 0, 1, 1] },
            },
        });
        // Allocate/upload the complete dataset, but sample its first and last records.
        renderer.render({
            draws: [0, count - 1].map((firstInstance) => ({
                mark,
                firstInstance,
                instanceCount: 1,
            })),
        });
        const ids = await Promise.all([
            renderer.pick(40, 50),
            renderer.pick(100, 50),
        ]);
        await renderer.device.queue.onSubmittedWorkDone();
        const error = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return { supported: true, limits, ids, error: error?.message ?? null };
    });
    test.skip(
        !result.supported,
        "Adapter byte capacity is below 160 MB: " +
            JSON.stringify(result.limits)
    );
    expect(result.limits.maxStorageBuffersPerShaderStage).toBe(8);
    expect(result.limits.maxBindGroups).toBe(4);
    expect(result.ids).toEqual([16777217, 4294967294]);
    expect(result.error).toBeNull();
    test.info().annotations.push({
        type: "device limits",
        description: JSON.stringify(result.limits),
    });
});
