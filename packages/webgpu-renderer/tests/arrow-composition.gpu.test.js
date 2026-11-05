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
        expect(Math.max(...result.repeatErrors)).toBeLessThanOrEqual(1);
        expect(result.repeatCoverage.every((count) => count > 0)).toBe(true);
        expect(Math.max(...result.alignmentErrors)).toBeLessThanOrEqual(1);
        expect(result.alignmentPicks).toEqual([77, null, 77, null, 77, null]);
        expect(result.openPicks).toEqual(Array(4).fill([77, null]));
        expect(result.revealedPicks).toEqual([77, null]);
        expect(result.clippedPicks).toEqual([77, null]);
        expect(result.outsidePicks).toEqual([77, null]);
        expect(result.zeroLength).toEqual([false, null]);
        for (const common of result.common) {
            expect(common.visible).toBe(true);
            expect(common.error).toBeLessThanOrEqual(1);
            expect(common.zero).toBe(false);
            expect(common.pick).toBe(77);
            expect(common.restored).toBe(true);
        }
        expect(result.validation).toBeNull();
    });
}

test("arrow scene retains opacity and stroke controls together", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const scene = await page.evaluateHandle(async () => {
        const { default: runArrowScene } =
            await import("/examples/arrowScene.js");
        const canvas = document.createElement("canvas");
        canvas.style.width = "320px";
        canvas.style.height = "240px";
        document.body.append(canvas);
        return runArrowScene(canvas, { opacity: 0 });
    });
    const canvas = page.locator("canvas");
    try {
        const empty = await canvas.screenshot();
        await scene.evaluate((scene) => scene.update({ opacity: 1 }));
        const full = await canvas.screenshot();
        expect(full.equals(empty)).toBe(false);

        // Retained alignment updates must keep common opacity connected.
        const options = { strokeAlign: 2, strokeWidth: 8, strokeOpacity: 0.5 };
        await scene.evaluate(
            (scene, options) => scene.update(options),
            options
        );
        const outlined = await canvas.screenshot();
        expect(outlined.equals(full)).toBe(false);
        await scene.evaluate(
            (scene, options) => scene.update({ ...options, opacity: 0 }),
            options
        );
        expect((await canvas.screenshot()).equals(empty)).toBe(true);
        await scene.evaluate(
            (scene, options) => scene.update(options),
            options
        );
        expect((await canvas.screenshot()).equals(outlined)).toBe(true);
    } finally {
        await scene.evaluate((scene) => scene.cleanup());
    }
});

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
                strokeAlign: 1,
                fill: [1, 0, 0, 1],
                stroke: [0, 0, 1, 1],
                opacity: 1,
                fillOpacity: 1,
                strokeOpacity: 1,
                direction: 0,
            }).map(([key, value]) => [
                key,
                {
                    value,
                    dynamic: true,
                    ...(["uniqueId", "direction", "strokeAlign"].includes(key)
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
        openPicks = [],
        repeatErrors = [],
        repeatCoverage = [],
        alignmentErrors = [],
        alignmentPicks = [],
        common = [];
    const checkOpacity = async (x = 32, y = cy) => {
        const full = await capture();
        set({ opacity: 0.5 });
        const half = await capture();
        set({ opacity: 0 });
        const zero = await capture();
        const pick = await renderer.pick(x, y);
        set({ opacity: 1 });
        const restored = await capture();
        common.push({
            visible: full.some(Boolean),
            error: half.reduce(
                (m, v, i) => Math.max(m, Math.abs(v - full[i] * 0.5)),
                0
            ),
            zero: zero.some(Boolean),
            pick,
            restored: restored.every((v, i) => v === full[i]),
        });
    };
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
        // The nominal stem edge crosses a pixel center: Cf=.5 at every DPR.
        set({ size: 8, strokeWidth: 4, fillOpacity: 1 });
        for (const [align, expected] of [
            [0, [64, 0, 64, 128]],
            [1, [64, 0, 128, 191]],
            [2, [128, 0, 64, 191]],
        ]) {
            set({ strokeAlign: align, strokeOpacity: 0.5 });
            samples.push([pixel(await capture()), expected]);
        }
        for (const shape of ["triangle", "open"]) {
            mark.properties.headShape.set(shape);
            set({ strokeWidth: 0, strokeOpacity: 1 });
            const nominal = await capture();
            for (const strokeAlign of [0, 1, 2]) {
                set({ strokeWidth: 4, strokeAlign, strokeOpacity: 0 });
                const transparent = await capture();
                alignmentErrors.push(
                    transparent.reduce(
                        (m, v, i) => Math.max(m, Math.abs(v - nominal[i])),
                        0
                    )
                );
            }
            // Equal outer envelopes exercise head diagonals and concave notches.
            set({ strokeAlign: 2, strokeOpacity: 1 });
            const outside = await capture();
            set({ strokeAlign: 1, strokeWidth: 8 });
            const centered = await capture();
            let error = 0;
            for (let i = 3; i < outside.length; i += 4) {
                error = Math.max(error, Math.abs(outside[i] - centered[i]));
            }
            alignmentErrors.push(error);
        }
        mark.properties.headShape.set("triangle");
        set({ strokeAlign: 2, strokeWidth: 4 });
        await capture();
        alignmentPicks.push(
            await renderer.pick(32, cy + 7),
            await renderer.pick(32, cy + 13)
        );
        await capture([
            { mark, scissor: { x: 0, y: 0, width: 40, height: 64 } },
        ]);
        alignmentPicks.push(
            await renderer.pick(32, cy + 7),
            await renderer.pick(44, cy + 7)
        );
        set({ strokeAlign: 0, strokeWidth: 20 });
        samples.push([pixel(await capture(), 32), [0, 0, 255, 255]]);
        alignmentPicks.push(
            await renderer.pick(32, cy + 3),
            await renderer.pick(32, cy + 5)
        );
        set({ strokeAlign: 1 });
        await checkOpacity();
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
            set({ fill: [1, 0, 0, 0.6] });
            await checkOpacity();
            set({ fill: [1, 0, 0, 1], strokeWidth: 0, strokeOpacity: 1 });
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
        // Spaced heads leave a visible hole beneath the transparent border.
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
        // A transparent border remains pickable; probe the remaining hole.
        const revealedPicks = [
            await renderer.pick(20.5, cy + 3),
            await renderer.pick(17.5, cy),
        ];
        await checkOpacity(20.5, cy + 3);
        set({ strokeWidth: 1, strokeOpacity: 1 });
        await capture([
            { mark, scissor: { x: 0, y: 0, width: 32, height: 64 } },
        ]);
        const clippedPicks = [
            await renderer.pick(20.5, cy + 3),
            await renderer.pick(44.5, cy + 3),
        ];
        // Invisible borders must not change tightly repeated nominal heads.
        mark.properties.headSpacing.set(0.5);
        for (const shape of ["triangle", "open"]) {
            for (const direction of [0, 1]) {
                mark.properties.headShape.set(shape);
                set({ direction });
                set({ strokeWidth: 0 });
                const nominal = await capture();
                for (const strokeWidth of [4, 24]) {
                    set({ strokeWidth, strokeOpacity: 0 });
                    const transparent = await capture();
                    repeatErrors.push(
                        transparent.reduce(
                            (m, v, i) => Math.max(m, Math.abs(v - nominal[i])),
                            0
                        )
                    );
                }
                const spacing = 8 + (shape === "open" ? 8 / Math.SQRT2 : 0);
                const count = Math.floor((48 - spacing) / spacing) + 1;
                const reference = renderer.createMark(arrowMark, {
                    ...config,
                    count,
                    stem: false,
                    headShape: shape,
                    channels: {
                        ...config.channels,
                        direction: { value: direction, type: "u32" },
                        x:
                            direction === 0
                                ? { value: 8 }
                                : {
                                      data: Float32Array.from(
                                          { length: count },
                                          (_, i) => 8 + i * spacing
                                      ),
                                  },
                        x2:
                            direction === 0
                                ? {
                                      data: Float32Array.from(
                                          { length: count },
                                          (_, i) => 56 - i * spacing
                                      ),
                                  }
                                : { value: 56 },
                        size: { value: 8 },
                        strokeWidth: { value: 24 },
                    },
                });
                set({ strokeOpacity: 1 });
                const actual = await capture();
                const expected = await capture([{ mark: reference }]);
                // Opaque, locally stable pixels avoid treating separately composited
                // antialiasing at adjacent heads as an exact union-coverage oracle.
                let error = 0,
                    foreground = 0,
                    background = 0;
                for (let y = 1; y < canvas.height - 1; y++) {
                    for (let x = 1; x < canvas.width - 1; x++) {
                        const i = (y * canvas.width + x) * 4 + 3;
                        const alpha = expected[i];
                        if (alpha !== 0 && alpha !== 255) continue;
                        let stable = true;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (
                                    expected[
                                        i + (dy * canvas.width + dx) * 4
                                    ] !== alpha
                                )
                                    stable = false;
                            }
                        }
                        if (stable) {
                            if (alpha === 255) foreground++;
                            else background++;
                            error = Math.max(
                                error,
                                Math.abs(actual[i] - alpha)
                            );
                        }
                    }
                }
                repeatErrors.push(error);
                repeatCoverage.push(foreground, background);
                renderer.destroyMark(reference.markId);
            }
        }
        mark.properties.headShape.set("open");
        // Exercise repeat admission, aligned paint and common opacity together.
        set({
            direction: 0,
            strokeWidth: 4,
            strokeAlign: 2,
            strokeOpacity: 0.6,
        });
        await checkOpacity(20.5, cy + 3);
        set({ strokeWidth: 1, strokeAlign: 1, strokeOpacity: 1 });
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
            repeatErrors,
            repeatCoverage,
            alignmentErrors,
            alignmentPicks,
            common,
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
