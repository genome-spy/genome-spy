/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`point paints share coverage at DPR ${dpr}`, async ({ page }) => {
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
            const capture = async (mark, items = [{ mark }]) => {
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
            const pixel = (bytes, x = 40 * dpr, y = 32 * dpr) => {
                const offset = (y * canvas.width + x) * 4;
                return Array.from(bytes.slice(offset, offset + 4));
            };
            const dynamic = (value) => ({ value, dynamic: true });
            const set = (mark, values) =>
                mark.batchUpdates(() => {
                    for (const [name, value] of Object.entries(values))
                        mark.values[name].set(value);
                });
            const routes = [];
            try {
                for (const shape of ["circle", "square"]) {
                    const mark = renderer.createMark(pointMark, {
                        shape,
                        count: 1,
                        channels: {
                            uniqueId: { value: 17, type: "u32" },
                            x: {
                                ...dynamic(32 + 0.5 / dpr),
                                scale: identityScale(),
                            },
                            y: {
                                ...dynamic(32 + 0.5 / dpr),
                                scale: identityScale(),
                            },
                            size: dynamic((16 + 0.5 / dpr) ** 2),
                            strokeWidth: dynamic(0.25 / dpr),
                            fill: { value: [1, 0, 0, 1] },
                            stroke: dynamic([0, 0, 1, 1]),
                            fillOpacity: dynamic(1),
                            strokeOpacity: dynamic(1),
                            inwardStroke: { ...dynamic(0), type: "u32" },
                        },
                    });
                    const centered = pixel(await capture(mark));
                    const scoped = pixel(
                        await capture(mark, [
                            {
                                opacity: 0.5,
                                bounds: { x: 0, y: 0, width: 64, height: 64 },
                                items: [{ mark }],
                            },
                        ])
                    );
                    set(mark, { fillOpacity: 0.8, strokeOpacity: 0.5 });
                    const translucent = pixel(await capture(mark));
                    set(mark, { fillOpacity: 0 });
                    const emptyFill = pixel(await capture(mark));
                    set(mark, {
                        size: 256,
                        fillOpacity: 0.8,
                        strokeWidth: 1 / dpr,
                        inwardStroke: 1,
                    });
                    const inwardTranslucent = pixel(await capture(mark));
                    set(mark, { fillOpacity: 1, strokeOpacity: 1 });
                    const inward = pixel(await capture(mark));
                    const picks = [
                        await renderer.pick(32, 32),
                        await renderer.pick(0, 0),
                    ];
                    set(mark, { inwardStroke: 0, strokeWidth: 0 });
                    const baseline = await capture(mark),
                        transparentErrors = [];
                    for (const values of [
                        { strokeWidth: 4, stroke: [0, 0, 1, 0] },
                        { stroke: [0, 0, 1, 1], strokeOpacity: 0 },
                    ]) {
                        set(mark, values);
                        const actual = await capture(mark);
                        transparentErrors.push(
                            actual.reduce(
                                (m, v, i) =>
                                    Math.max(m, Math.abs(v - baseline[i])),
                                0
                            )
                        );
                    }
                    let tiny = null;
                    if (shape === "square") {
                        // Characterize the existing UV-clamping limitation; do not fix its geometry here.
                        set(mark, {
                            x: 32,
                            y: 32,
                            size: 4,
                            strokeWidth: 8,
                            stroke: [0, 0, 1, 0],
                            strokeOpacity: 1,
                        });
                        tiny = pixel(await capture(mark), 33 * dpr, 32 * dpr);
                    }
                    routes.push({
                        centered,
                        scoped,
                        translucent,
                        emptyFill,
                        inwardTranslucent,
                        inward,
                        picks,
                        transparentErrors,
                        tiny,
                    });
                    renderer.destroyMark(mark.markId);
                }
                const x = new Float32Array([8, 24, 40, 56]);
                const data = {
                    uniqueId: new Uint32Array([21, 22, 23, 24]),
                    x,
                    shape: new Uint32Array([0, 1, 2, 3]),
                    fill: new Float32Array([
                        1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1,
                    ]),
                    stroke: new Float32Array(16).fill(1),
                    angle: new Float32Array([0, 30, 0, 0]),
                };
                const mixed = renderer.createMark(pointMark, {
                    shapes: ["circle", "triangle-up", "x", "+"],
                    count: 4,
                    channels: {
                        uniqueId: {
                            data: data.uniqueId,
                            type: "u32",
                        },
                        x: {
                            data: data.x,
                            type: "f32",
                            scale: identityScale(),
                        },
                        y: { value: 16, scale: identityScale() },
                        size: { value: 144 },
                        shape: {
                            data: data.shape,
                            type: "u32",
                        },
                        fill: { data: data.fill, components: 4 },
                        stroke: { data: data.stroke, components: 4 },
                        strokeWidth: { value: 1 },
                        angle: { data: data.angle },
                        inwardStroke: { ...dynamic(0), type: "u32" },
                    },
                });
                const initial = await capture(mixed),
                    before = [];
                for (const value of x)
                    before.push(await renderer.pick(value, 16));
                const shapePick = [await renderer.pick(40, 11)];
                data.shape.set([3, 2, 1, 0]);
                data.stroke.set([
                    0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
                ]);
                mixed.series.replace(data, 4);
                mixed.values.inwardStroke.set(1);
                const updated = await capture(mixed);
                const changed = initial.some((v, i) => v !== updated[i]);
                shapePick.push(await renderer.pick(40, 11));
                const strokePixel = pixel(
                    updated,
                    61 * dpr + dpr - 1,
                    16 * dpr
                );
                await capture(mixed, [
                    {
                        mark: mixed,
                        scissor: { x: 0, y: 0, width: 32, height: 64 },
                    },
                ]);
                const clipped = [];
                for (const value of x)
                    clipped.push(await renderer.pick(value, 16));
                data.x.fill(32);
                data.shape.fill(0);
                mixed.series.replace(data, 4);
                const overlap = pixel(await capture(mixed), 32 * dpr, 16 * dpr);
                return {
                    routes,
                    before,
                    shapePick,
                    strokePixel,
                    changed,
                    clipped,
                    overlap,
                    overlapPick: await renderer.pick(32, 16),
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
        const close = (actual, expected) =>
            actual.forEach((v, i) =>
                expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(2)
            );
        for (const route of result.routes) {
            // Centered: Ci=.625,Cf=.75,Co=.875. Inward edge: Ci=0,Cf=Co=.5.
            close(route.centered, [159, 0, 64, 223]);
            close(route.translucent, [140, 0, 32, 172]);
            close(route.emptyFill, [0, 0, 32, 32]);
            close(route.scoped, [80, 0, 32, 112]);
            close(route.inward, [0, 0, 128, 128]);
            close(route.inwardTranslucent, [51, 0, 64, 115]);
            expect(route.picks).toEqual([17, null]);
            expect(Math.max(...route.transparentErrors)).toBeLessThanOrEqual(2);
        }
        close(result.routes[1].tiny, [
            dpr === 1 ? 193 : 198,
            0,
            0,
            dpr === 1 ? 193 : 198,
        ]);
        expect(result.before).toEqual([21, 22, 23, 24]);
        expect(result.changed).toBe(true);
        expect(result.shapePick).toEqual([null, 23]);
        expect(result.strokePixel[1]).toBeGreaterThan(240);
        expect(
            result.strokePixel[0] + result.strokePixel[2]
        ).toBeLessThanOrEqual(2);
        expect(result.clipped).toEqual([21, 22, null, null]);
        expect(result.overlap).toEqual([255, 255, 0, 255]);
        expect(result.overlapPick).toBe(24);
    });
}
