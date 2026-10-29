import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`arrow paint composition at DPR ${dpr}`, async ({ page }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(renderArrows, dpr);
        for (const [actual, expected] of result.samples) {
            actual.forEach((v, i) =>
                expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(2)
            );
        }
        expect(Math.max(...result.transparentErrors)).toBeLessThanOrEqual(2);
        expect(result.openPicks).toEqual(Array(4).fill([77, null]));
        expect(result.revealedPicks).toEqual([77, null]);
        expect(result.clippedPicks).toEqual([77, null]);
        expect(result.outsidePicks).toEqual([77, null]);
        expect(result.zeroLength).toEqual([false, null]);
        expect(result.validation).toBeNull();
    });
}

/** @param {number} dpr */
async function renderArrows(dpr) {
    const [{ createRenderer }, { arrowMark }] = await Promise.all([
        import("/src/index.js"),
        import("/src/marks/arrow.js"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64 * dpr;
    document.body.append(canvas);
    const renderer = await createRenderer(canvas, { format: "rgba8unorm" });
    renderer.context.configure({
        device: renderer.device,
        format: renderer.format,
        alphaMode: "premultiplied",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    renderer.updateGlobals({ width: 64, height: 64, dpr });
    renderer.device.pushErrorScope("validation");
    const cy = 32 + 0.5 / dpr;
    const config = {
        count: 1,
        headShape: "triangle",
        headWidth: 2,
        minSize: 0,
        channels: Object.fromEntries(
            Object.entries({
                uniqueId: 77,
                x: 8,
                x2: 56,
                y: cy,
                y2: cy,
                size: 8 - 0.25 / dpr,
                strokeWidth: 0.25 / dpr,
                fill: [1, 0, 0, 1],
                stroke: [0, 0, 1, 1],
                fillOpacity: 1,
                strokeOpacity: 1,
                direction: 0,
            }).map(([key, value]) => [
                key,
                {
                    value,
                    dynamic: true,
                    ...(["uniqueId", "direction"].includes(key)
                        ? { type: "u32" }
                        : {}),
                },
            ])
        ),
    };
    const mark = renderer.createMark(arrowMark, config);
    const buffer = renderer.device.createBuffer({
        size: canvas.width * canvas.height * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    /** @param {object} values */
    const set = (values) =>
        mark.batchUpdates(() => {
            for (const [key, value] of Object.entries(values))
                mark.values[key].set(value);
        });
    /** @param {object[]} [items] */
    const capture = async (items = [{ mark }]) => {
        renderer.render({ items, clearColor: { r: 0, g: 0, b: 0, a: 0 } });
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
    /** @param {Uint8Array} bytes @param {number} [y] */
    const pixel = (bytes, y = 36) => {
        const i = (y * dpr * canvas.width + 32 * dpr) * 4;
        return Array.from(bytes.slice(i, i + 4));
    };
    const samples = [],
        transparentErrors = [],
        openPicks = [];
    try {
        // Straight stem: d=.125/DPR, Ci=.25, Cf=.375, Co=.5.
        samples.push([pixel(await capture()), [64, 0, 64, 128]]);
        set({ strokeOpacity: 0.5 });
        samples.push([pixel(await capture()), [80, 0, 32, 112]]);
        set({ fillOpacity: 0.8 });
        samples.push([pixel(await capture()), [64, 0, 32, 96]]);
        set({ fillOpacity: 0 });
        samples.push([pixel(await capture()), [0, 0, 32, 32]]);
        set({ size: 8, strokeWidth: 20, fillOpacity: 1 });
        const wide = await capture();
        samples.push(
            [pixel(wide), [64, 0, 128, 191]],
            [pixel(wide, 32), [128, 0, 128, 255]]
        );
        set({
            size: 8 - 0.25 / dpr,
            strokeWidth: 0.25 / dpr,
            strokeOpacity: 1,
        });
        samples.push([
            pixel(
                await capture([
                    {
                        opacity: 0.5,
                        bounds: { x: 0, y: 0, width: 64, height: 64 },
                        items: [{ mark }],
                    },
                ])
            ),
            [32, 0, 32, 64],
        ]);
        for (const shape of ["triangle", "open"]) {
            mark.properties.headShape.set(shape);
            set({ size: 8, strokeWidth: 0 });
            const baseline = await capture();
            for (const paints of [
                { strokeWidth: 4, stroke: [0, 0, 1, 0] },
                { stroke: [0, 0, 1, 1], strokeOpacity: 0 },
            ]) {
                set(paints);
                const actual = await capture();
                transparentErrors.push(
                    actual.reduce(
                        (m, v, i) => Math.max(m, Math.abs(v - baseline[i])),
                        0
                    )
                );
            }
            set({ strokeWidth: 0, strokeOpacity: 1 });
        }
        mark.properties.stem.set(false);
        set({ strokeWidth: 1 });
        for (const [direction, arm, hole] of [
            [0, 44.5, 42.5],
            [1, 19.5, 21.5],
            [2, 19.5, 21.5],
            [2, 44.5, 42.5],
        ]) {
            set({ direction });
            await capture();
            openPicks.push([
                await renderer.pick(arm, cy + 3),
                await renderer.pick(hole, cy),
            ]);
        }
        // Spacing3 avoids the separately tracked stroke-dependent repeat clamp.
        mark.properties.headSpacing.set(3);
        set({ direction: 0, strokeWidth: 0 });
        const nominal = await capture();
        set({ strokeWidth: 4, strokeOpacity: 0 });
        const transparent = await capture();
        transparentErrors.push(
            transparent.reduce(
                (m, v, i) => Math.max(m, Math.abs(v - nominal[i])),
                0
            )
        );
        const revealedPicks = [
            await renderer.pick(20.5, cy + 3),
            await renderer.pick(18.5, cy),
        ];
        set({ strokeWidth: 1, strokeOpacity: 1 });
        await capture([
            { mark, scissor: { x: 0, y: 0, width: 32, height: 64 } },
        ]);
        const clippedPicks = [
            await renderer.pick(20.5, cy + 3),
            await renderer.pick(44.5, cy + 3),
        ];
        mark.properties.headSpacing.set(null);
        mark.properties.headPlacement.set("outside");
        set({ x: 16, x2: 48 });
        await capture();
        const outsidePicks = [
            await renderer.pick(47.8, cy + 3),
            await renderer.pick(45.8, cy),
        ];
        mark.properties.stem.set(true);
        mark.properties.headShape.set("triangle");
        mark.properties.headPlacement.set("inside");
        set({ x: 8, x2: 56, strokeWidth: 0 });
        set({ x2: 8 });
        const zeroLength = [
            (await capture()).some((v) => v !== 0),
            await renderer.pick(8, cy),
        ];
        return {
            samples,
            transparentErrors,
            openPicks,
            revealedPicks,
            clippedPicks,
            outsidePicks,
            zeroLength,
            validation:
                (await renderer.device.popErrorScope())?.message ?? null,
        };
    } finally {
        buffer.destroy();
        renderer.destroy();
        canvas.remove();
    }
}
