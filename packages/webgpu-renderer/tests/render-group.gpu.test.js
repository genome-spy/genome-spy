/* global document, GPUBufferUsage, GPUMapMode, GPUTextureUsage */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("multisampled group applies opacity once after overlap", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const pixels = await page.evaluate(async () => {
        const [{ createRenderer }, { rectMark }, { identityScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/rect.js"),
                import("/src/scales/identity.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.context.configure({
            device: renderer.device,
            format: renderer.format,
            alphaMode: "premultiplied",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        renderer.updateGlobals({ width: 64, height: 64, dpr: 1 });

        const createRect = (x, y, x2, y2, fill) =>
            renderer.createMark(rectMark, {
                count: 1,
                channels: {
                    x: { value: x, scale: identityScale() },
                    y: { value: y, scale: identityScale() },
                    x2: { value: x2, scale: identityScale() },
                    y2: { value: y2, scale: identityScale() },
                    fill: { value: fill },
                    strokeWidth: { value: 0 },
                },
            });
        const red = createRect(8, 8, 40, 40, [1, 0, 0, 1]);
        const blue = createRect(24, 24, 56, 56, [0, 0, 1, 1]);
        const canvasTexture = renderer.context.getCurrentTexture();
        renderer.device.pushErrorScope("validation");
        renderer.render({
            clearColor: { r: 0, g: 0, b: 0, a: 0 },
            items: [
                {
                    bounds: { x: 0, y: 0, width: 64, height: 64 },
                    opacity: 0.5,
                    sampleCount: 4,
                    items: [{ mark: red }, { mark: blue }],
                },
            ],
        });
        const readback = renderer.device.createBuffer({
            size: 256 * 64,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = renderer.device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture: canvasTexture },
            { buffer: readback, bytesPerRow: 256 },
            { width: 64, height: 64 }
        );
        renderer.device.queue.submit([encoder.finish()]);
        await renderer.device.queue.onSubmittedWorkDone();
        const validationError = await renderer.device.popErrorScope();
        await readback.mapAsync(GPUMapMode.READ);
        const bytes = new Uint8Array(readback.getMappedRange());
        const read = (x, y) => {
            const offset = y * 256 + x * 4;
            const pixel = Array.from(bytes.subarray(offset, offset + 4));
            return renderer.format.startsWith("bgra")
                ? [pixel[2], pixel[1], pixel[0], pixel[3]]
                : pixel;
        };
        const result = {
            validationError: validationError?.message ?? null,
            red: read(12, 12),
            overlap: read(30, 30),
            empty: read(2, 2),
        };
        readback.unmap();
        readback.destroy();
        renderer.destroy();
        canvas.remove();
        return result;
    });

    expect(pixels.validationError).toBeNull();
    expect(pixels.red).toEqual([128, 0, 0, 128]);
    expect(pixels.overlap).toEqual([0, 0, 128, 128]);
    expect(pixels.empty).toEqual([0, 0, 0, 0]);
});
