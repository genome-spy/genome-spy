/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`named line points use stroke width at DPR ${dpr}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const [
                { createRenderer },
                { pointMark },
                { identityScale },
                { resolvePointShape },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/identity.js"),
                import("/src/symbols/pointShapes.js"),
            ]);
            const canvas = document.createElement("canvas");
            canvas.width = 256 * dpr;
            canvas.height = 64 * dpr;
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
            renderer.updateGlobals({ width: 256, height: 64, dpr });
            renderer.device.pushErrorScope("validation");
            const dynamic = (value) => ({ value, dynamic: true });
            const custom =
                "M-.15-1H.15V-.15H1V.15H.15V1H-.15V.15H-1V-.15H-.15Z";
            const channels = {
                y: { value: 32.5, scale: identityScale() },
                size: dynamic(400),
                strokeWidth: dynamic(2),
                angle: dynamic(0),
                inwardStroke: { ...dynamic(0), type: "u32" },
                stroke: dynamic([0, 0, 1, 0.5]),
                strokeOpacity: dynamic(1),
                fill: { value: [1, 0, 0, 0.6] },
                minPickingSize: dynamic(2),
            };
            // Duplicate names share behavior; an equivalent custom path stays filled.
            const mark = renderer.createMark(pointMark, {
                count: 4,
                shapes: ["x", "+", "x", custom],
                placementIndex: { source: "draw" },
                channels: {
                    ...channels,
                    x: {
                        data: new Float32Array([32.5, 96.5, 160.5, 224.5]),
                        type: "f32",
                        scale: identityScale(),
                    },
                    shape: { data: new Uint32Array([0, 1, 2, 3]), type: "u32" },
                    uniqueId: {
                        data: new Uint32Array([10, 11, 12, 13]),
                        type: "u32",
                    },
                },
            });
            const reference = renderer.createMark(pointMark, {
                count: 1,
                shapes: ["x", "+", "x", custom].map(resolvePointShape),
                placementIndex: { source: "draw" },
                channels: {
                    ...channels,
                    shape: { value: 3 },
                    x: { value: 224.5, scale: identityScale() },
                },
            });
            const placements = renderer.createPlacementSet({
                rectangles: new Float32Array([0, 0, 1, 1]),
            });
            const buffer = renderer.device.createBuffer({
                size: canvas.width * canvas.height * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const capture = async (handle, scissor) => {
                renderer.render({
                    items: [
                        {
                            mark: handle,
                            placement: {
                                set: placements,
                                index: 0,
                                clipToPlacement: "xy",
                            },
                            scissor,
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
            const set = (values) => {
                for (const handle of [mark, reference])
                    handle.batchUpdates(() => {
                        for (const [name, value] of Object.entries(values))
                            handle.values[name].set(value);
                    });
            };
            let oracleError = 0,
                customError = 0,
                clippedAlpha = 0;
            const empty = [],
                picks = [];
            try {
                for (const [size, width, angle, inward, stroke, opacity] of [
                    [400, 2, 0, 0, [0, 0, 1, 0.5], 1],
                    [900, 6, 31, 1, [0, 0, 1, 0.5], 0.6],
                    [16, 12, 73, 0, [0, 0, 1, 0], 1],
                    [400, 2, 0, 1, [0, 0, 1, 1], 0],
                ]) {
                    set({
                        size,
                        strokeWidth: width,
                        angle,
                        inwardStroke: inward,
                        stroke,
                        strokeOpacity: opacity,
                    });
                    const actual = await capture(mark);
                    const expectedCustom = await capture(reference);
                    const useStroke = stroke[3] * opacity > 0;
                    const alpha =
                        stroke[3] * opacity > 0 ? stroke[3] * opacity : 0.6;
                    for (let y = 0; y < canvas.height; y++)
                        for (let x = 0; x < canvas.width; x++) {
                            const offset = (y * canvas.width + x) * 4;
                            if (x >= 192 * dpr) {
                                for (let c = 0; c < 4; c++)
                                    customError = Math.max(
                                        customError,
                                        Math.abs(
                                            actual[offset + c] -
                                                expectedCustom[offset + c]
                                        )
                                    );
                                continue;
                            }
                            // Independent coverage oracle for two perpendicular butt-ended arms.
                            let distance = Infinity;
                            for (const [center, diagonal] of [
                                [32.5, true],
                                [96.5, false],
                                [160.5, true],
                            ]) {
                                const radians =
                                    ((angle + (diagonal ? -45 : 0)) * Math.PI) /
                                    180;
                                const dx = (x + 0.5) / dpr - center,
                                    dy = (y + 0.5) / dpr - 32.5;
                                const px = Math.abs(
                                    Math.cos(radians) * dx +
                                        Math.sin(radians) * dy
                                );
                                const py = Math.abs(
                                    -Math.sin(radians) * dx +
                                        Math.cos(radians) * dy
                                );
                                const length =
                                    (Math.sqrt(size) / 2) *
                                    (diagonal ? Math.SQRT2 : 1);
                                distance = Math.min(
                                    distance,
                                    Math.min(
                                        Math.max(px - width / 2, py - length),
                                        Math.max(px - length, py - width / 2)
                                    )
                                );
                            }
                            const coverage = Math.max(
                                0,
                                Math.min(1, 0.5 - distance * dpr)
                            );
                            const expected = useStroke
                                ? [0, 0, 1, 1]
                                : [1, 0, 0, 1];
                            for (let c = 0; c < 4; c++) {
                                oracleError = Math.max(
                                    oracleError,
                                    Math.abs(
                                        actual[offset + c] -
                                            255 * alpha * coverage * expected[c]
                                    )
                                );
                            }
                        }
                }
                for (const values of [
                    { size: 0 },
                    { size: 400, strokeWidth: 0 },
                    { strokeWidth: -2 },
                ]) {
                    set(values);
                    const bytes = await capture(mark);
                    empty.push(
                        bytes.every(
                            (v, i) =>
                                i % (canvas.width * 4) >= 192 * dpr * 4 ||
                                v === 0
                        )
                    );
                    picks.push(await renderer.pick(96.5, 32.5));
                }
                set({
                    size: 0.01,
                    strokeWidth: 2,
                    angle: 0,
                    inwardStroke: 0,
                    minPickingSize: 14,
                });
                await capture(mark);
                const minimum = [];
                for (const dx of [0, 1, 3, 6, 9])
                    minimum.push(await renderer.pick(96.5 + dx, 32.5));
                set({ size: 400, strokeWidth: 16, angle: 33 });
                const clipped = await capture(mark, {
                    x: 0,
                    y: 30,
                    width: 256,
                    height: 8,
                });
                const clippedPick = await renderer.pick(96.5, 25);
                placements.replace({
                    rectangles: new Float32Array([0, 0, 1, 0.5]),
                });
                const placed = await capture(mark);
                const placedPick = await renderer.pick(96.5, 40);
                for (let y = 0; y < canvas.height; y++)
                    for (let x = 0; x < canvas.width; x++) {
                        const i = (y * canvas.width + x) * 4 + 3;
                        if (y < 30 * dpr || y >= 38 * dpr)
                            clippedAlpha = Math.max(clippedAlpha, clipped[i]);
                        if (y >= 32 * dpr)
                            clippedAlpha = Math.max(clippedAlpha, placed[i]);
                    }
                return {
                    oracleError,
                    customError,
                    empty,
                    picks,
                    minimum,
                    clippedAlpha,
                    clippedPick,
                    placedPick,
                    error: await renderer.device.popErrorScope(),
                };
            } finally {
                buffer.destroy();
                placements.destroy();
                renderer.destroy();
            }
        }, dpr);
        expect(result.oracleError).toBeLessThanOrEqual(1.03);
        expect(result.customError).toBe(0);
        expect(result.empty).toEqual([true, true, true]);
        expect(result.picks).toEqual([null, null, null]);
        expect(result.minimum).toEqual([11, 11, 11, null, null]);
        expect(result.clippedAlpha).toBe(0);
        expect(result.clippedPick).toBeNull();
        expect(result.placedPick).toBeNull();
        expect(result.error).toBeNull();
    });
}
