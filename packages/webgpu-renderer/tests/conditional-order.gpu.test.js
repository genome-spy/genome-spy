import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

// Exercise actual compositing and per-draw uniform storage, not just WGSL text.
for (const matching of /** @type {const} */ (["first", "last"])) {
    test(`conditional order paints matching instances ${matching} and preserves picking`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (matching) => {
            const [{ createRenderer }, { pointMark }, { linearScale }] =
                await Promise.all([
                    import("/src/index.js"),
                    import("/src/marks/point.js"),
                    import("/src/scales/linear.js"),
                ]);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 128;
            document.body.appendChild(canvas);
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
            renderer.updateGlobals({ width: 128, height: 128, dpr: 1 });
            renderer.device.pushErrorScope("validation");
            const mark = renderer.createMark(pointMark, {
                count: 2,
                channels: {
                    uniqueId: { data: new Uint32Array([41, 42]), type: "u32" },
                    x: {
                        value: 64,
                        scale: linearScale({
                            domain: [0, 128],
                            range: [0, 128],
                        }),
                    },
                    y: {
                        value: 64,
                        scale: linearScale({
                            domain: [0, 128],
                            range: [0, 128],
                        }),
                    },
                    size: { value: 1600 },
                    fill: {
                        data: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
                        type: "f32",
                        components: 4,
                    },
                    fillOpacity: { value: 0.5 },
                    strokeWidth: { value: 0 },
                },
                order: {
                    when: { selection: "picked", type: "single", empty: false },
                    matching,
                },
            });
            const read = async () => {
                renderer.render({
                    draws: [{ mark }],
                    clearColor: { r: 0, g: 0, b: 0, a: 0 },
                });
                const buffer = renderer.device.createBuffer({
                    size: 128 * 128 * 4,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                const encoder = renderer.device.createCommandEncoder();
                encoder.copyTextureToBuffer(
                    { texture: renderer.context.getCurrentTexture() },
                    { buffer, bytesPerRow: 128 * 4 },
                    { width: 128, height: 128 }
                );
                renderer.device.queue.submit([encoder.finish()]);
                await buffer.mapAsync(GPUMapMode.READ);
                const pixel = Array.from(
                    new Uint8Array(buffer.getMappedRange()).slice(
                        (64 * 128 + 64) * 4,
                        (64 * 128 + 64) * 4 + 4
                    )
                );
                buffer.unmap();
                buffer.destroy();
                return pixel;
            };
            const empty = await read();
            mark.selections.picked.set(41);
            const promoted = await read();
            const implicitPicked = await renderer.pick(64, 64);
            renderer.renderPicking({ draws: [{ mark }] });
            const picked = await renderer.pick(64, 64);
            mark.selections.picked.set(0);
            const cleared = await read();
            const validation = await renderer.device.popErrorScope();
            renderer.destroy();
            canvas.remove();
            return {
                empty,
                promoted,
                cleared,
                picked,
                implicitPicked,
                validation: validation?.message,
            };
        }, matching);
        expect(result.validation).toBeUndefined();
        expect(result.empty[2]).toBeGreaterThan(result.empty[0]);
        if (matching === "last") {
            expect(result.promoted[0]).toBeGreaterThan(result.promoted[2]);
        } else {
            expect(result.promoted).toEqual(result.empty);
        }
        expect(result.promoted[3]).toBe(result.empty[3]);
        expect(result.cleared).toEqual(result.empty);
        expect(result.picked).toBe(42);
        expect(result.implicitPicked).toBe(42);
    });
}
