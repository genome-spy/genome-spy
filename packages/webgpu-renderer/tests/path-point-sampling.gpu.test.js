/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`path point sampling preserves nominal fill at DPR ${dpr}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const [{ createRenderer }, { pointMark }, { identityScale }] =
                await Promise.all([
                    import("/src/index.js"),
                    import("/src/marks/point.js"),
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
            const buffer = renderer.device.createBuffer({
                size: canvas.width * canvas.height * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const placement = renderer.createPlacementSet({
                rectangles: new Float32Array([0, 0, 1, 1]),
            });
            const dynamic = (value) => ({ value, dynamic: true });
            // A shared atlas with neighboring, dissimilar entries exposes tile bleed.
            const shapes = ["square", "diamond", "M-1-1L1-.4L.4.2L.7 1L-1 .6Z"];
            const mark = renderer.createMark(pointMark, {
                count: 1,
                shapes,
                placementIndex: { source: "draw" },
                channels: {
                    x: { ...dynamic(32.25), scale: identityScale() },
                    y: { ...dynamic(32.25), scale: identityScale() },
                    shape: { ...dynamic(0), type: "u32" },
                    uniqueId: { value: 17, type: "u32" },
                    size: dynamic(16),
                    angle: dynamic(0),
                    fill: { value: [1, 0.2, 0.1, 0.8] },
                    stroke: dynamic([0, 0, 1, 0]),
                    strokeWidth: dynamic(0),
                    strokeAlign: { value: 1, type: "u32" },
                },
            });
            const set = (values) =>
                mark.batchUpdates(() => {
                    for (const [name, value] of Object.entries(values))
                        mark.values[name].set(value);
                });
            const capture = async () => {
                renderer.render({
                    items: [
                        {
                            mark,
                            placement: {
                                set: placement,
                                index: 0,
                                clipToPlacement: "xy",
                            },
                        },
                    ],
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
            let invariantError = 0;
            let edgeError = 0;
            let interiorError = 0;
            let background = 0;
            let edgeSamples = 0;
            let interiorSamples = 0;
            let backgroundSamples = 0;
            const picks = [];
            try {
                for (let shape = 0; shape < shapes.length; shape++) {
                    for (const [diameter, angle] of [
                        [1, 0],
                        [4, 33],
                        [16, 0],
                    ]) {
                        set({
                            shape,
                            size: diameter ** 2,
                            angle,
                            strokeWidth: 0,
                        });
                        const nominal = await capture();
                        set({ strokeWidth: 16 });
                        const bordered = await capture();
                        for (let i = 0; i < nominal.length; i++) {
                            invariantError = Math.max(
                                invariantError,
                                Math.abs(nominal[i] - bordered[i])
                            );
                        }
                        picks.push(await renderer.pick(32.25, 32.25));
                        picks.push(await renderer.pick(1, 1));
                    }
                }
                // Independently check planar edges, away from MSDF corner approximation.
                for (const strokeAlpha of [0, 0.5]) {
                    set({
                        shape: 0,
                        size: 16 ** 2,
                        angle: 33,
                        strokeWidth: 2,
                        stroke: [0, 0, 1, strokeAlpha],
                    });
                    const bytes = await capture();
                    const angle = (33 * Math.PI) / 180;
                    for (let y = 0; y < canvas.height; y++) {
                        for (let x = 0; x < canvas.width; x++) {
                            const dx = (x + 0.5) / dpr - 32.25;
                            const dy = (y + 0.5) / dpr - 32.25;
                            const localX = Math.abs(
                                dx * Math.cos(angle) + dy * Math.sin(angle)
                            );
                            const localY = Math.abs(
                                -dx * Math.sin(angle) + dy * Math.cos(angle)
                            );
                            const distance =
                                (8 - Math.max(localX, localY)) * dpr;
                            const offset = (y * canvas.width + x) * 4;
                            if (distance < -dpr - 0.5) {
                                background = Math.max(
                                    background,
                                    bytes[offset + 3]
                                );
                                backgroundSamples++;
                            }
                            // Native RGB distance reconstruction intentionally has separate corner limits.
                            if ((8 - Math.min(localX, localY)) * dpr < 2)
                                continue;
                            const coverage = (d) =>
                                Math.max(0, Math.min(1, d + 0.5));
                            const cf = coverage(distance);
                            const ci = coverage(distance - dpr);
                            const co = coverage(distance + dpr);
                            const f = ci + (cf - ci) * (1 - strokeAlpha);
                            const s = (co - ci) * strokeAlpha;
                            const expected = [
                                0.8 * f,
                                0.16 * f,
                                0.08 * f,
                                0.8 * f + s,
                            ];
                            // The blue paint adds its premultiplied blue channel.
                            expected[2] += s;
                            for (let c = 0; c < 4; c++) {
                                const error = Math.abs(
                                    bytes[offset + c] - expected[c] * 255
                                );
                                if (ci === 1)
                                    interiorError = Math.max(
                                        interiorError,
                                        error
                                    );
                                else if (co > 0)
                                    edgeError = Math.max(edgeError, error);
                            }
                            if (ci === 1) interiorSamples++;
                            else if (co > 0) edgeSamples++;
                        }
                    }
                }
                // Subpixel shapes may miss pixel centers, but must not be culled wholesale.
                set({
                    shape: 0,
                    size: (0.5 / dpr) ** 2,
                    angle: 0,
                    strokeWidth: 0,
                    x: 32 + 0.5 / dpr,
                    y: 32 + 0.5 / dpr,
                });
                const aligned = await capture();
                let subpixelAlpha = 0;
                for (let i = 3; i < aligned.length; i += 4)
                    subpixelAlpha = Math.max(subpixelAlpha, aligned[i]);
                return {
                    invariantError,
                    subpixelAlpha,
                    edgeError,
                    interiorError,
                    background,
                    edgeSamples,
                    interiorSamples,
                    backgroundSamples,
                    picks,
                    validation: await renderer.device.popErrorScope(),
                };
            } finally {
                buffer.destroy();
                placement.destroy();
                renderer.destroy();
                canvas.remove();
            }
        }, dpr);
        expect(result.invariantError).toBeLessThanOrEqual(2);
        expect(result.edgeError).toBeLessThanOrEqual(2);
        expect(result.interiorError).toBeLessThanOrEqual(1);
        expect(result.background).toBe(0);
        expect(result.subpixelAlpha).toBeGreaterThan(0);
        expect(result.edgeSamples).toBeGreaterThan(20);
        expect(result.interiorSamples).toBeGreaterThan(20);
        expect(result.backgroundSamples).toBeGreaterThan(100);
        expect(result.picks).toEqual(
            Array.from({ length: 9 }, () => [17, null]).flat()
        );
        expect(result.validation).toBeNull();
    });
}
