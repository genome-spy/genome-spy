/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`rectangle strokes preserve aligned paint at DPR ${dpr}`, async ({
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
                    x2: { ...dynamic(48 + 0.5 / dpr), scale: identityScale() },
                    y: { value: 16 + 0.5 / dpr, scale: identityScale() },
                    y2: { ...dynamic(48 + 0.5 / dpr), scale: identityScale() },
                    fill: dynamic([1, 0, 0, 1]),
                    stroke: dynamic([0, 0, 1, 0]),
                    opacity: dynamic(1),
                    fillOpacity: dynamic(1),
                    minWidth: dynamic(0),
                    minHeight: dynamic(0),
                    minOpacity: dynamic(0),
                    strokeOpacity: dynamic(1),
                    strokeWidth: dynamic(0),
                    strokeAlign: { ...dynamic(1), type: "u32" },
                    cornerRadiusTopLeft: dynamic(0),
                    cornerRadiusTopRight: dynamic(0),
                    cornerRadiusBottomLeft: dynamic(0),
                    cornerRadiusBottomRight: dynamic(0),
                    hatchPattern: { ...dynamic(0), type: "u32" },
                    shadowOpacity: dynamic(0),
                    shadowOffsetX: dynamic(8),
                    shadowBlur: dynamic(1),
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
            const interiorError = (a, b) => {
                let error = 0;
                for (let y = 24 * dpr; y < 40 * dpr; y++) {
                    for (let x = 24 * dpr; x < 40 * dpr; x++) {
                        for (let c = 0; c < 4; c++) {
                            const i = (y * canvas.width + x) * 4 + c;
                            error = Math.max(error, Math.abs(a[i] - b[i]));
                        }
                    }
                }
                return error;
            };
            const set = (values) =>
                mark.batchUpdates(() => {
                    for (const [name, value] of Object.entries(values))
                        mark.values[name].set(value);
                });
            const checkOpacity = async (handle) => {
                const items = [{ mark: handle }];
                const full = await capture(items);
                handle.values.opacity.set(0.5);
                const half = await capture(items);
                handle.values.opacity.set(0);
                const zero = await capture(items);
                const pick = await renderer.pick(32, 32);
                handle.values.opacity.set(1);
                const restored = await capture(items);
                return {
                    visible: full.some(Boolean),
                    shadow: pixel(full, 54 * dpr, 32 * dpr)[3],
                    error: half.reduce(
                        (m, v, i) => Math.max(m, Math.abs(v - full[i] * 0.5)),
                        0
                    ),
                    zero: zero.some(Boolean),
                    pick,
                    restored: restored.every((v, i) => v === full[i]),
                };
            };
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
                // Unequal radii expose a top/bottom inversion hidden by symmetric corners.
                set({
                    cornerRadiusTopLeft: 12,
                    cornerRadiusTopRight: 0,
                    cornerRadiusBottomLeft: 4,
                    cornerRadiusBottomRight: 8,
                });
                const asymmetric = await capture();
                const cornerPositions = [
                    [18, 18],
                    [47, 18],
                    [18, 46],
                    [47, 47],
                ];
                const corners = cornerPositions.map(([x, y]) =>
                    pixel(asymmetric, x * dpr, y * dpr)
                );
                const cornerPicks = [];
                for (const [x, y] of cornerPositions) {
                    cornerPicks.push(await renderer.pick(x, y));
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
                // The stripe spans local x=[0, 4/dpr]: both edges have half coverage.
                const hatchSamples = [-1, 0, 1, 4, 5].map((offset) =>
                    pixel(hatched, 32 * dpr + offset, 32 * dpr)
                );
                let hatchPaddingError = 0;
                for (const hatchPattern of [4, 5, 6]) {
                    set({ hatchPattern, shadowOffsetX: 0 });
                    const reference = await capture();
                    for (const shadowOffsetX of [2, 8]) {
                        // Invisible shadow padding must not move interior hatch stripes.
                        set({ shadowOffsetX });
                        const actual = await capture();
                        hatchPaddingError = Math.max(
                            hatchPaddingError,
                            interiorError(actual, reference)
                        );
                    }
                }
                set({ hatchPattern: 0, shadowOffsetX: 8 });
                const overlay = renderer.createMark(rectMark, {
                    count: 1,
                    channels: {
                        x: { value: 24, scale: identityScale() },
                        x2: { value: 44, scale: identityScale() },
                        y: { value: 24, scale: identityScale() },
                        y2: { value: 44, scale: identityScale() },
                        fill: { value: [0, 1, 0, 0.5] },
                        stroke: {
                            data: new Float32Array([1, 0, 0, 0.5]),
                            components: 4,
                        },
                        strokeWidth: { value: 4 },
                    },
                });
                const draws = [{ mark }, { mark: overlay }];
                const overlap = pixel(await capture(draws), 32 * dpr, 32 * dpr);
                overlay.series.replace(
                    { stroke: new Float32Array([0, 0, 1, 0.5]) },
                    1
                );
                const updated = pixel(await capture(draws), 25 * dpr, 32 * dpr);
                await capture();
                const picks = [];
                for (const x of [32, 16, 12])
                    picks.push(await renderer.pick(x, 32));
                set({ shadowOpacity: 1 });
                const shadow = pixel(await capture(), 54 * dpr, 32 * dpr);
                set({ fillOpacity: 0, strokeOpacity: 0 });
                const shadowOnly = pixel(
                    await capture(),
                    48 * dpr + 2,
                    32 * dpr
                );
                set({ strokeOpacity: 0.5 });
                const shadowOverlap = pixel(
                    await capture(),
                    48 * dpr + 2,
                    32 * dpr
                );
                set({
                    fillOpacity: 0.6,
                    strokeOpacity: 0.5,
                    hatchPattern: 3,
                    cornerRadiusTopLeft: 6,
                    cornerRadiusBottomRight: 6,
                });
                const common = await checkOpacity(mark);
                // Static plain edges retain multisample coverage with dynamic opacity.
                const plain = renderer.createMark(rectMark, {
                    count: 1,
                    channels: {
                        uniqueId: { value: 19, type: "u32" },
                        x: { value: 16.25, scale: identityScale() },
                        x2: { value: 48.25, scale: identityScale() },
                        y: { value: 16.25, scale: identityScale() },
                        y2: { value: 48.25, scale: identityScale() },
                        fill: { value: [1, 0, 0, 0.6] },
                        strokeWidth: { value: 0 },
                        opacity: dynamic(1),
                    },
                });
                const plainCommon = await checkOpacity(plain);
                renderer.destroyMark(plain.markId);
                set({
                    hatchPattern: 0,
                    cornerRadiusTopLeft: 0,
                    cornerRadiusBottomRight: 0,
                    shadowOpacity: 0,
                    fillOpacity: 1,
                    strokeOpacity: 1,
                    strokeWidth: 4,
                });
                const fades = [];
                for (const [end, minimum, x, y] of [
                    ["x2", "minWidth", 15, 32],
                    ["y2", "minHeight", 32, 15],
                ]) {
                    set({ [end]: 20 + 0.5 / dpr, [minimum]: 8 });
                    fades.push(pixel(await capture(), x * dpr, y * dpr));
                    set({ [end]: 48 + 0.5 / dpr, [minimum]: 0 });
                }
                set({
                    strokeWidth: 4,
                    fillOpacity: 0.8,
                    strokeOpacity: 0.5,
                    shadowOffsetX: 0,
                    shadowBlur: 0,
                });
                set({ strokeWidth: 0 });
                const nominal = await capture();
                const aligned = [];
                for (const strokeAlign of [0, 1, 2]) {
                    set({ strokeAlign, strokeWidth: 4, strokeOpacity: 0 });
                    const transparent = await capture();
                    const transparentError = transparent.reduce(
                        (m, v, i) => Math.max(m, Math.abs(v - nominal[i])),
                        0
                    );
                    set({ strokeOpacity: 0.5 });
                    aligned.push({
                        opacityError: (await checkOpacity(mark)).error,
                        transparentError,
                        edge: pixel(await capture(), 32 * dpr, 16 * dpr),
                        picks: [
                            await renderer.pick(32, 13),
                            await renderer.pick(32, 11),
                        ],
                    });
                }
                set({ strokeAlign: 1, hatchPattern: 4 });
                const centeredHatch = await capture();
                const hatchAlignmentErrors = [];
                for (const strokeAlign of [0, 2]) {
                    set({ strokeAlign });
                    hatchAlignmentErrors.push(
                        interiorError(await capture(), centeredHatch)
                    );
                }
                set({
                    hatchPattern: 0,
                    fill: [0, 0, 1, 1],
                    fillOpacity: 1,
                    strokeOpacity: 1,
                });
                const envelopeErrors = [];
                for (const radius of [0, 6]) {
                    set({
                        cornerRadiusTopLeft: radius,
                        cornerRadiusTopRight: radius,
                        cornerRadiusBottomLeft: radius,
                        cornerRadiusBottomRight: radius,
                        strokeAlign: 1,
                        strokeWidth: 8,
                    });
                    const centeredDouble = await capture();
                    set({ strokeAlign: 2, strokeWidth: 4 });
                    const outside = await capture();
                    envelopeErrors.push(
                        outside.reduce(
                            (m, v, i) =>
                                Math.max(m, Math.abs(v - centeredDouble[i])),
                            0
                        )
                    );
                }
                const consumedInteriors = [];
                for (const [strokeAlign, strokeWidth] of [
                    [0, 16],
                    [1, 32],
                ]) {
                    set({
                        strokeAlign,
                        strokeWidth,
                        fill: [1, 0, 0, 1],
                        hatchPattern: 0,
                    });
                    const plain = await capture();
                    set({ hatchPattern: 4 });
                    const hatched = await capture();
                    consumedInteriors.push({
                        center: pixel(plain, 32 * dpr, 32 * dpr),
                        hatchError: hatched.reduce(
                            (m, v, i) => Math.max(m, Math.abs(v - plain[i])),
                            0
                        ),
                    });
                }
                set({
                    strokeAlign: 0,
                    strokeWidth: 40,
                    fill: [1, 0, 0, 1],
                    hatchPattern: 0,
                });
                const oversizedInside = pixel(
                    await capture(),
                    32 * dpr,
                    32 * dpr
                );
                set({ strokeAlign: 2, strokeWidth: 4 });
                await capture([
                    { mark, scissor: { x: 0, y: 16, width: 64, height: 48 } },
                ]);
                const clippedBorder = await renderer.pick(32, 13);
                return {
                    corners,
                    cornerPicks,
                    aligned,
                    oversizedInside,
                    consumedInteriors,
                    hatchAlignmentErrors,
                    envelopeErrors,
                    clippedBorder,
                    fades,
                    common,
                    plainCommon,
                    shadowOnly,
                    shadowOverlap,
                    transparentErrors,
                    samples,
                    seam,
                    emptyFill,
                    scoped,
                    picks,
                    shadow,
                    rounded,
                    hatchSamples,
                    hatchPaddingError,
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
        expect(result.corners).toEqual([
            [0, 0, 0, 0],
            [255, 0, 0, 255],
            [255, 0, 0, 255],
            [0, 0, 0, 0],
        ]);
        expect(result.cornerPicks).toEqual([null, 7, 7, null]);
        for (const [common, pick] of [
            [result.common, 7],
            [result.plainCommon, 19],
        ]) {
            expect(common.visible).toBe(true);
            expect(common.error).toBeLessThanOrEqual(1);
            expect(common.zero).toBe(false);
            expect(common.pick).toBe(pick);
            expect(common.restored).toBe(true);
        }
        expect(result.common.shadow).toBeGreaterThan(0);
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
        expect(result.hatchPaddingError).toBeLessThanOrEqual(1);
        // Half-covered edges of a 50%-opaque stroke contribute 25% blue over red.
        [
            [255, 0, 0, 255],
            [191, 0, 64, 255],
            [128, 0, 128, 255],
            [191, 0, 64, 255],
            [255, 0, 0, 255],
        ].forEach((p, i) => close(result.hatchSamples[i], p));
        [
            [51, 0, 64, 115],
            [51, 0, 128, 179],
            [102, 0, 64, 166],
        ].forEach((p, i) => close(result.aligned[i].edge, p));
        expect(result.aligned.map((a) => a.picks)).toEqual([
            [null, null],
            [null, null],
            [7, null],
        ]);
        expect(Math.max(...result.hatchAlignmentErrors)).toBeLessThanOrEqual(1);
        expect(Math.max(...result.envelopeErrors)).toBeLessThanOrEqual(1);
        expect(result.aligned.every((a) => a.transparentError <= 1)).toBe(true);
        expect(result.aligned.every((a) => a.opacityError <= 1)).toBe(true);
        close(result.oversizedInside, [0, 0, 255, 255]);
        // A consumed inner contour must not leave a partially covered fill line.
        for (const item of result.consumedInteriors) {
            close(item.center, [0, 0, 255, 255]);
            expect(item.hatchError).toBeLessThanOrEqual(1);
        }
        expect(result.clippedBorder).toBeNull();
        close(result.overlap, [128, 128, 0, 255]);
        close(result.updated, [64, 64, 128, 255]);
        for (const faded of result.fades) close(faded, [0, 0, 128, 128]);
        close(result.shadowOverlap, [
            0,
            result.shadowOnly[1] * 0.75,
            64,
            64 + result.shadowOnly[3] * 0.75,
        ]);
    });
}
