import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`density includes raster-aligned boundary centers without shifting interior bins (DPR=${dpr})`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const [
                { createRenderer },
                {
                    pointMark,
                    createPointDensityPreview,
                    createPointLassoSelection,
                },
                { linearScale },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/linear.js"),
            ]);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 24 * dpr;
            document.body.append(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width: 24, height: 24, dpr });
            renderer.device.pushErrorScope("validation");
            const neutral = [0.4, 0.46, 0.55, 1],
                highlight = [1, 0.35, 0.05, 1];
            // Four semantic in-plot centers, followed by four genuinely offscreen rows.
            const mark = renderer.createMark(pointMark, {
                channels: {
                    x: {
                        data: new Float32Array([
                            1, 0.5, 0, 0.5, 1.02, -0.02, 0.5, 0.5,
                        ]),
                        type: "f32",
                        scale: linearScale({
                            domain: [0, 1],
                            range: [4.5, 20.5],
                        }),
                    },
                    y: {
                        data: new Float32Array([
                            0.5, 0, 1, 0.5, 0.5, 0.5, -0.02, 1.02,
                        ]),
                        type: "f32",
                        scale: linearScale({
                            domain: [0, 1],
                            range: [20.5, 4.5],
                        }),
                    },
                    uniqueId: {
                        data: new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]),
                        type: "u32",
                    },
                    size: { value: 16 },
                    strokeWidth: { value: 0 },
                    fill: {
                        value: neutral,
                        conditions: [
                            {
                                channel: { value: highlight, dynamic: true },
                                when: {
                                    selection: "lasso",
                                    type: "multi",
                                    empty: false,
                                },
                            },
                        ],
                    },
                },
            });
            /** @type {[number, number, number, number]} */
            const view = [4, 20, 20, 4];
            /** @type {[number, number, number, number]} */
            const bounds = [4.5, 4.5, 20.5, 20.5];
            /** @type {[number, number][]} */
            const polygon = [
                [4.5, 4.5],
                [20.5, 4.5],
                [20.5, 20.5],
                [4.5, 20.5],
            ];
            const snapshot = createPointLassoSelection(renderer, mark);
            const grid = snapshot.setDensityGrid(
                16 * dpr,
                16 * dpr,
                view,
                bounds
            );
            snapshot.update(polygon);
            const readCounts = async (buffer) => {
                const staging = renderer.device.createBuffer({
                    size: buffer.size,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                const encoder = renderer.device.createCommandEncoder();
                encoder.copyBufferToBuffer(buffer, 0, staging, 0, buffer.size);
                renderer.device.queue.submit([encoder.finish()]);
                await staging.mapAsync(GPUMapMode.READ);
                const counts = Array.from(
                    new Uint32Array(staging.getMappedRange())
                );
                staging.destroy();
                return counts;
            };
            const total = await readCounts(grid.total),
                selected = await readCounts(grid.selected);
            let boundsError;
            try {
                snapshot.setDensityGrid(16 * dpr, 16 * dpr, view, [
                    4.5,
                    4.5,
                    NaN,
                    20.5,
                ]);
            } catch (error) {
                boundsError = error.message;
            }
            snapshot.destroy();
            const preview = createPointDensityPreview(renderer, mark, {
                neutral,
                highlight,
                view,
                bounds,
                viewport: [4 * dpr, 4 * dpr, 16 * dpr, 16 * dpr],
                draw: () =>
                    renderer.render({
                        draws: [
                            {
                                mark,
                                scissor: { x: 4, y: 4, width: 16, height: 16 },
                            },
                        ],
                    }),
            });
            const pixels = async () => {
                preview.render();
                const staging = renderer.device.createBuffer({
                    size: 3 * 256,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                const encoder = renderer.device.createCommandEncoder();
                [
                    [19, 12],
                    [12, 19],
                    [12, 12],
                ].forEach(([x, y], i) =>
                    encoder.copyTextureToBuffer(
                        {
                            texture: canvas
                                .getContext("webgpu")
                                .getCurrentTexture(),
                            origin: [x * dpr, y * dpr],
                        },
                        { buffer: staging, offset: i * 256, bytesPerRow: 256 },
                        [1, 1]
                    )
                );
                renderer.device.queue.submit([encoder.finish()]);
                await staging.mapAsync(GPUMapMode.READ);
                const bytes = new Uint8Array(staging.getMappedRange());
                const colors = [0, 1, 2].map((i) =>
                    Array.from(bytes.subarray(i * 256, i * 256 + 4))
                );
                staging.destroy();
                return colors;
            };
            const unselected = await pixels();
            await preview.update(polygon);
            const live = await pixels();
            preview.stop();
            mark.selections.lasso.set(new Uint32Array([1, 2, 3, 4]), true);
            await preview.renderSelection("lasso");
            const committed = await pixels();
            preview.destroy();
            const error = await renderer.device.popErrorScope();
            renderer.destroy();
            return {
                total,
                selected,
                unselected,
                live,
                committed,
                boundsError,
                error: error?.message,
            };
        }, dpr);
        expect(result.total.reduce((a, b) => a + b)).toBe(4);
        expect(result.selected).toEqual(result.total);
        const interior = Math.floor(8.5 * dpr);
        expect(result.total[interior * 16 * dpr + interior]).toBe(1);
        result.live.forEach((color, i) =>
            expect(color).not.toEqual(result.unselected[i])
        );
        expect(result.committed).toEqual(result.live);
        expect(result.boundsError).toContain("finite nonzero f32 spans");
        expect(result.error).toBeUndefined();
    });
}

for (const alternateFormat of [false, true]) {
    test(`point density uses authoritative IDs without another geometry draw (alternate format=${alternateFormat})`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (alternateFormat) => {
            const [
                { createRenderer },
                { pointMark, createPointDensityPreview },
                { linearScale },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/linear.js"),
            ]);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 24;
            document.body.append(canvas);
            const preferred = navigator.gpu.getPreferredCanvasFormat();
            const renderer = await createRenderer(canvas, {
                format: alternateFormat
                    ? preferred === "bgra8unorm"
                        ? "rgba8unorm"
                        : "bgra8unorm"
                    : preferred,
            });
            renderer.device.pushErrorScope("validation");
            renderer.updateGlobals({ width: 24, height: 24, dpr: 1 });
            const neutral = [0.4, 0.46, 0.55, 1];
            const highlight = [1, 0.35, 0.05, 1];
            const mark = renderer.createMark(pointMark, {
                channels: {
                    x: {
                        data: new Float32Array([0.25, 0.5, 0.75]),
                        type: "f32",
                        scale: linearScale({ domain: [0, 1], range: [0, 16] }),
                    },
                    y: {
                        data: new Float32Array([0.25, 0.5, 0.75]),
                        type: "f32",
                        scale: linearScale({ domain: [0, 1], range: [16, 0] }),
                    },
                    uniqueId: { data: new Uint32Array([1, 2, 3]), type: "u32" },
                    size: { value: 4 },
                    strokeWidth: { value: 0 },
                    fill: {
                        value: neutral,
                        conditions: [
                            {
                                channel: { value: highlight, dynamic: true },
                                when: {
                                    selection: "lasso",
                                    type: "multi",
                                    empty: false,
                                },
                            },
                        ],
                    },
                },
            });
            let draws = 0;
            const preview = createPointDensityPreview(renderer, mark, {
                neutral,
                highlight,
                view: [0, 16, 16, 0],
                viewport: [4, 4, 16, 16],
                draw: () => {
                    draws++;
                    renderer.render({
                        draws: [
                            {
                                mark,
                                viewport: { x: 4, y: 4, width: 16, height: 16 },
                            },
                        ],
                    });
                },
            });
            const readPixel = async (x, y) => {
                const staging = renderer.device.createBuffer({
                    size: 256,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                const encoder = renderer.device.createCommandEncoder();
                encoder.copyTextureToBuffer(
                    {
                        texture: canvas
                            .getContext("webgpu")
                            .getCurrentTexture(),
                        origin: [x, y],
                    },
                    { buffer: staging, bytesPerRow: 256 },
                    [1, 1]
                );
                renderer.device.queue.submit([encoder.finish()]);
                await staging.mapAsync(GPUMapMode.READ);
                const pixel = Array.from(
                    new Uint8Array(staging.getMappedRange()).subarray(0, 4)
                );
                staging.destroy();
                return pixel;
            };
            const first = preview.update([
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
            ]);
            const live = await readPixel(16, 8);
            await first;
            preview.stop();
            mark.selections.lasso.set(new Uint32Array([1]), true);
            const committed = preview.renderSelection("lasso");
            const unselected = await readPixel(16, 8);
            await committed;
            const selectedDraw = preview.renderSelection("lasso");
            const selected = await readPixel(8, 16);
            await selectedDraw;
            const outsideDraw = preview.renderSelection("lasso");
            const outside = await readPixel(0, 0);
            await outsideDraw;
            // A stopped in-flight update cannot overwrite a later committed selection.
            const pending = preview.update([
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
            ]);
            preview.stop();
            await preview.renderSelection("lasso");
            await pending;
            const restoreDraw = preview.renderSelection("lasso");
            const restored = await readPixel(16, 8);
            await restoreDraw;
            mark.selections.lasso.set(new Uint32Array(), false);
            const clearDraw = preview.renderSelection("lasso");
            const cleared = await readPixel(8, 16);
            await clearDraw;
            preview.destroy();
            renderer.render();
            const error = await renderer.device.popErrorScope();
            renderer.destroy();
            return {
                draws,
                live,
                unselected,
                selected,
                outside,
                restored,
                cleared,
                error: error?.message,
            };
        }, alternateFormat);
        expect(result.draws).toBe(1);
        expect(result.live).not.toEqual(result.unselected);
        expect(result.selected).not.toEqual(result.cleared);
        expect(result.outside).toEqual([255, 255, 255, 255]);
        expect(result.restored).toEqual(result.unselected);
        expect(result.error).toBeUndefined();
    });
}
