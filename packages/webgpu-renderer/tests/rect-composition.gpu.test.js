/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`centered rectangle strokes preserve underlying paint at DPR ${dpr}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const [{ createRenderer }, { rectMark }, { identityScale }] =
                await Promise.all([
                    import("/src/index.js"),
                    import("/src/marks/rect.js"),
                    import("/src/scales/identity.js"),
                ]);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 64 * dpr;
            document.body.append(canvas);
            const renderer = await createRenderer(canvas, {
                format: "rgba8unorm",
            });
            renderer.context.configure({
                device: renderer.device,
                format: renderer.format,
                alphaMode: "premultiplied",
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.COPY_SRC,
            });
            renderer.updateGlobals({ width: 64, height: 64, dpr });
            renderer.device.pushErrorScope("validation");
            const dynamic = (value) => ({ value, dynamic: true });
            const mark = renderer.createMark(rectMark, {
                count: 1,
                channels: {
                    uniqueId: { value: 7, type: "u32" },
                    x: { value: 16 + 0.5 / dpr, scale: identityScale() },
                    x2: { value: 48 + 0.5 / dpr, scale: identityScale() },
                    y: { value: 16 + 0.5 / dpr, scale: identityScale() },
                    y2: { value: 48 + 0.5 / dpr, scale: identityScale() },
                    fill: dynamic([1, 0, 0, 1]),
                    stroke: dynamic([0, 0, 1, 0]),
                    fillOpacity: dynamic(1),
                    strokeOpacity: dynamic(1),
                    strokeWidth: dynamic(0),
                    cornerRadiusTopLeft: dynamic(0),
                    cornerRadiusTopRight: dynamic(0),
                    cornerRadiusBottomLeft: dynamic(0),
                    cornerRadiusBottomRight: dynamic(0),
                    hatchPattern: { ...dynamic(0), type: "u32" },
                    shadowOpacity: dynamic(0),
                    shadowOffsetX: { value: 8 },
                    shadowBlur: { value: 1 },
                    shadowColor: { value: [0, 1, 0, 1] },
                },
            });
            const buffer = renderer.device.createBuffer({
                size: canvas.width * canvas.height * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const capture = async (items = [{ mark }]) => {
                renderer.render({
                    items,
                    clearColor: { r: 0, g: 0, b: 0, a: 0 },
                });
                const encoder = renderer.device.createCommandEncoder();
                encoder.copyTextureToBuffer(
                    { texture: renderer.context.getCurrentTexture() },
                    { buffer, bytesPerRow: canvas.width * 4 },
                    { width: canvas.width, height: canvas.height }
                );
                renderer.device.queue.submit([encoder.finish()]);
                await buffer.mapAsync(GPUMapMode.READ);
                const bytes = new Uint8Array(buffer.getMappedRange()).slice();
                buffer.unmap();
                return bytes;
            };
            const pixel = (bytes, x, y) =>
                Array.from(
                    bytes.slice(
                        (y * canvas.width + x) * 4,
                        (y * canvas.width + x) * 4 + 4
                    )
                );
            const set = (values) =>
                mark.batchUpdates(() => {
                    for (const [name, value] of Object.entries(values))
                        mark.values[name].set(value);
                });
            try {
                // Compare the complete nominal shape, not just an interior sample.
                const transparentErrors = [];
                for (const radius of [0, 6]) {
                    set({
                        cornerRadiusTopLeft: radius,
                        cornerRadiusTopRight: radius / 2,
                        cornerRadiusBottomLeft: radius / 3,
                        cornerRadiusBottomRight: radius,
                    });
                    const baseline = await capture();
                    for (const width of [0.25 / dpr, 4 / dpr, 40]) {
                        set({ strokeWidth: width });
                        for (const hatchPattern of [0, 1]) {
                            set({ hatchPattern });
                            const actual = await capture();
                            transparentErrors.push(
                                Math.max(
                                    ...actual.map((v, i) =>
                                        Math.abs(v - baseline[i])
                                    )
                                )
                            );
                        }
                    }
                    set({ strokeWidth: 0, hatchPattern: 0 });
                }
                set({
                    cornerRadiusTopLeft: 0,
                    cornerRadiusTopRight: 0,
                    cornerRadiusBottomLeft: 0,
                    cornerRadiusBottomRight: 0,
                    strokeWidth: 4 / dpr,
                    stroke: [0, 0, 1, 1],
                    strokeOpacity: 0.5,
                });
                const translucent = await capture();
                const samples = [14, 16, 17, 18, 32].map((y) =>
                    pixel(translucent, 32 * dpr, 16 * dpr + y - 16)
                );
                set({ strokeOpacity: 1 });
                const opaque = await capture();
                const seam = pixel(opaque, 32 * dpr, 18 * dpr);
                set({ strokeOpacity: 0.5, fillOpacity: 0 });
                const emptyFill = pixel(await capture(), 32 * dpr, 16 * dpr);
                set({ fillOpacity: 1 });
                const scoped = pixel(
                    await capture([
                        {
                            opacity: 0.5,
                            bounds: { x: 0, y: 0, width: 64, height: 64 },
                            items: [{ mark }],
                        },
                    ]),
                    32 * dpr,
                    16 * dpr
                );
                set({
                    cornerRadiusTopLeft: 6,
                    cornerRadiusTopRight: 6,
                    cornerRadiusBottomLeft: 6,
                    cornerRadiusBottomRight: 6,
                });
                const rounded = pixel(await capture(), 18 * dpr, 18 * dpr);
                set({
                    cornerRadiusTopLeft: 0,
                    cornerRadiusTopRight: 0,
                    cornerRadiusBottomLeft: 0,
                    cornerRadiusBottomRight: 0,
                    hatchPattern: 4,
                });
                const hatched = await capture();
                const hatchPixel = pixel(hatched, 32 * dpr, 32 * dpr);
                set({ hatchPattern: 0 });
                const overlay = renderer.createMark(rectMark, {
                    count: 1,
                    channels: {
                        x: { value: 24, scale: identityScale() },
                        x2: { value: 44, scale: identityScale() },
                        y: { value: 24, scale: identityScale() },
                        y2: { value: 44, scale: identityScale() },
                        fill: {
                            data: new Float32Array([0, 1, 0, 0.5]),
                            components: 4,
                        },
                        strokeWidth: { value: 0 },
                    },
                });
                const draws = [{ mark }, { mark: overlay }];
                const overlap = pixel(await capture(draws), 32 * dpr, 32 * dpr);
                overlay.series.replace(
                    { fill: new Float32Array([0, 0, 1, 0.5]) },
                    1
                );
                const updated = pixel(await capture(draws), 32 * dpr, 32 * dpr);
                await capture();
                const picks = [];
                for (const x of [32, 15, 12])
                    picks.push(await renderer.pick(x, 32));
                // Shadow picking is an existing policy, deliberately outside this fix.
                set({ shadowOpacity: 1 });
                const shadow = pixel(await capture(), 54 * dpr, 32 * dpr);
                return {
                    transparentErrors,
                    samples,
                    seam,
                    emptyFill,
                    scoped,
                    picks,
                    shadow,
                    rounded,
                    hatchPixel,
                    overlap,
                    updated,
                    error:
                        (await renderer.device.popErrorScope())?.message ??
                        null,
                };
            } finally {
                buffer.destroy();
                renderer.destroy();
                canvas.remove();
            }
        }, dpr);
        expect(result.error).toBeNull();
        expect(Math.max(...result.transparentErrors)).toBeLessThanOrEqual(2);
        const close = (actual, expected) =>
            actual.forEach((v, i) =>
                expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(2)
            );
        // Premultiplied paints at outer edge, nominal edge, inward band and interior.
        [
            [0, 0, 64, 64],
            [64, 0, 128, 191],
            [128, 0, 128, 255],
            [191, 0, 64, 255],
            [255, 0, 0, 255],
        ].forEach((p, i) => close(result.samples[i], p));
        expect(result.seam[3]).toBe(255);
        close(result.emptyFill, [0, 0, 128, 128]);
        close(result.scoped, [32, 0, 64, 96]);
        expect(result.picks).toEqual([7, 7, null]);
        expect(result.shadow[1]).toBeGreaterThan(0);
        // This corner sample is on a radius-six circle, outside its inner offset.
        const coverage = Math.min(1, (6 - Math.sqrt(32)) * dpr + 0.5);
        close(result.rounded, [
            127.5 * coverage,
            0,
            127.5,
            127.5 * (1 + coverage),
        ]);
        close(result.hatchPixel, [128, 0, 128, 255]);
        close(result.overlap, [128, 128, 0, 255]);
        close(result.updated, [128, 0, 128, 255]);
    });
}
