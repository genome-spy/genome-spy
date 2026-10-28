/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("placed rules preserve their pixel stroke width", async ({ page }) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { ruleMark }] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rule.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0.25, 1, 0.25]),
        });
        const mark = renderer.createMark(ruleMark, {
            count: 1,
            dashPatterns: [[4, 4]],
            channels: {
                uniqueId: { value: 17, type: "u32" },
                x: { value: 8 },
                x2: { value: 56 },
                y: { value: 32 },
                y2: { value: 32 },
                size: { value: 8 },
                xClampRange: { value: [16, 48], components: 2 },
                strokeWidth: { value: 0, dynamic: true },
            },
            placementIndex: { source: "draw" },
        });

        const frame = {
            draws: [
                {
                    mark,
                    placement: { set: placements, index: 0 },
                },
            ],
        };
        renderer.render(frame);
        await renderer.device.queue.onSubmittedWorkDone();
        const ids = [await renderer.pick(32, 27), await renderer.pick(32, 29)];
        mark.values.strokeWidth.set(2);
        renderer.render(frame);
        ids.push(await renderer.pick(32, 29), await renderer.pick(32, 31));
        ids.push(await renderer.pick(14, 24), await renderer.pick(13, 24));
        frame.draws[0].scissor = { x: 0, y: 0, width: 64, height: 28 };
        renderer.render(frame);
        ids.push(await renderer.pick(32, 29));
        renderer.destroy();
        canvas.remove();
        return {
            ids,
            maxStorageBuffersPerShaderStage:
                renderer.device.limits.maxStorageBuffersPerShaderStage,
            maxBindGroups: renderer.device.limits.maxBindGroups,
        };
    });

    expect(result).toEqual({
        ids: [17, null, 17, null, 17, null, null],
        maxStorageBuffersPerShaderStage: 8,
        maxBindGroups: 4,
    });
});

for (const dpr of [1, 2]) {
    test(`thin body and butt endpoints survive border updates at DPR ${dpr}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const [{ createRenderer }, { ruleMark }] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/rule.js"),
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
            // Endpoints lie on physical pixel centers so their half coverage is observable.
            const rows = [
                { cap: 0, size: 0.25, reverse: false, min: 0 },
                { cap: 0, size: 0.25, reverse: true, min: 0 },
                { cap: 1, size: 4, reverse: false, min: 0 },
                { cap: 2, size: 4, reverse: false, min: 0 },
                { cap: 0, size: 0.25, reverse: false, min: 48 },
                { cap: 0, size: 0, reverse: false, min: 0 },
                { cap: 0, size: -1, reverse: false, min: 0 },
            ];
            const f32 = (fn) => new Float32Array(rows.map(fn));
            const mark = renderer.createMark(ruleMark, {
                count: rows.length,
                dashPatterns: [],
                channels: {
                    uniqueId: {
                        data: new Uint32Array(rows.map((_, i) => i + 1)),
                        type: "u32",
                    },
                    x: { data: f32((r) => (r.reverse ? 44 : 12) + 0.5 / dpr) },
                    x2: { data: f32((r) => (r.reverse ? 12 : 44) + 0.5 / dpr) },
                    y: { data: f32((_, i) => 8 + i * 8 + 0.5 / dpr) },
                    y2: { data: f32((_, i) => 8 + i * 8 + 0.5 / dpr) },
                    size: { data: f32((r) => r.size / dpr) },
                    minLength: { data: f32((r) => r.min) },
                    strokeCap: {
                        data: new Uint32Array(rows.map((r) => r.cap)),
                        type: "u32",
                    },
                    fill: { value: [1, 0, 0, 0.8] },
                    fillOpacity: { value: 1, dynamic: true },
                    strokeOpacity: { value: 1, dynamic: true },
                    strokeAlign: { value: 2, type: "u32", dynamic: true },
                    opacity: { value: 0.65, dynamic: true },
                    stroke: { value: [0, 0, 1, 0], dynamic: true },
                    strokeWidth: { value: 0, dynamic: true },
                },
            });
            const buffer = renderer.device.createBuffer({
                size: canvas.width * canvas.height * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const points = rows.flatMap((r, i) => {
                const start = r.min ? 4 * dpr : 12 * dpr - (r.cap ? 2 : 0);
                const end = r.min ? 52 * dpr : 44 * dpr + (r.cap ? 2 : 0);
                return [start, end, 20 * dpr].map((x) => [
                    x,
                    (8 + i * 8) * dpr,
                ]);
            });
            const paint = async (
                width,
                alpha,
                samples = points,
                draws = [{ mark }]
            ) => {
                mark.batchUpdates(() => {
                    mark.values.strokeWidth.set(width);
                    mark.values.stroke.set([0, 0, 1, alpha]);
                });
                return capture(samples, draws);
            };
            const capture = async (samples = points, draws = [{ mark }]) => {
                renderer.render({
                    draws,
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
                const bytes = new Uint8Array(buffer.getMappedRange());
                const pixels = samples.map(([x, y]) =>
                    Array.from(
                        bytes.slice(
                            (y * canvas.width + x) * 4,
                            (y * canvas.width + x) * 4 + 4
                        )
                    )
                );
                buffer.unmap();
                return pixels;
            };
            try {
                const baseline = await paint(0, 0);
                const updates = [];
                for (const width of [0.25 / dpr, 1 / dpr, 4 / dpr]) {
                    for (const alpha of [0, 1 / 255])
                        updates.push(await paint(width, alpha));
                }
                const noBorderPicks = [];
                await paint(1 / dpr, 0);
                for (const [x, y] of points)
                    noBorderPicks.push(
                        await renderer.pick((x + 0.5) / dpr, (y + 0.5) / dpr)
                    );
                const opaque = await paint(1 / dpr, 1);
                const borderPicks = [];
                for (let i = 0; i < rows.length; i++) {
                    const [x, y] = points[i * 3 + 1];
                    borderPicks.push(
                        await renderer.pick((x + 0.5) / dpr, (y + 0.5) / dpr)
                    );
                }
                // Physical-pixel fixtures: opaque band boundaries, then translucent paint overlap.
                const ribbon = {
                    x: new Float32Array([12.5 / dpr]),
                    x2: new Float32Array([44.5 / dpr]),
                    y: new Float32Array([32.5 / dpr]),
                    y2: new Float32Array([32.5 / dpr]),
                    size: new Float32Array([8 / dpr]),
                    minLength: new Float32Array([0]),
                    strokeCap: new Uint32Array([0]),
                    uniqueId: new Uint32Array([9]),
                };
                mark.series.replace(ribbon, 1);
                mark.values.opacity.set(1);
                const aligned = [];
                const samples = [
                    [32, 32],
                    [32, 29],
                    [32, 27],
                    [11, 32],
                    [12, 32],
                ];
                for (const align of [0, 1, 2]) {
                    mark.values.strokeAlign.set(align);
                    aligned.push(await paint(2 / dpr, 1, samples));
                }
                mark.values.strokeAlign.set(0);
                const collapsed = await paint(8 / dpr, 1, [[32, 32]]);
                mark.values.opacity.set(0.5);
                mark.values.fillOpacity.set(0.5);
                mark.values.strokeOpacity.set(0.5);
                const composed = await paint(2 / dpr, 1, [
                    [32, 32],
                    [32, 29],
                ]);
                mark.values.opacity.set(1);
                mark.values.fillOpacity.set(1);
                mark.values.strokeOpacity.set(1);
                const caps = [];
                for (const cap of [1, 2]) {
                    ribbon.strokeCap[0] = cap;
                    mark.series.replace(ribbon, 1);
                    for (const align of [0, 1, 2]) {
                        mark.values.strokeAlign.set(align);
                        caps.push(await paint(2 / dpr, 1, [[8, 32]]));
                    }
                }
                const neighbor = renderer.createMark(ruleMark, {
                    count: 1,
                    channels: {
                        x: { value: 32.5 / dpr },
                        x2: { value: 32.5 / dpr },
                        y: { value: 12 / dpr },
                        y2: { value: 44 / dpr },
                        size: { value: 8 / dpr },
                        fill: { value: [0, 1, 0, 0.5] },
                    },
                });
                mark.values.opacity.set(0.5);
                mark.values.fillOpacity.set(0.5);
                const crossing = [];
                for (const draws of [
                    [{ mark }, { mark: neighbor }],
                    [{ mark: neighbor }, { mark }],
                ])
                    crossing.push(await paint(2 / dpr, 1, [[32, 32]], draws));
                const acuteX = 24.5 / dpr + 2.25;
                const acuteY = 44.5 / dpr - Math.sqrt(7) - 1;
                const dashData = {
                    uniqueId: new Uint32Array([17, 18, 19]),
                    x: new Float32Array([8 + 0.5 / dpr, 8 + 0.5 / dpr, acuteX]),
                    x2: new Float32Array([
                        40 + 0.5 / dpr,
                        40 + 0.5 / dpr,
                        acuteX + 32,
                    ]),
                    y: new Float32Array([
                        8 + 0.5 / dpr,
                        24 + 0.5 / dpr,
                        acuteY,
                    ]),
                    y2: new Float32Array([
                        8 + 0.5 / dpr,
                        24 + 0.5 / dpr,
                        acuteY,
                    ]),
                    size: new Float32Array([4, 4 / dpr, 8]),
                    strokeWidth: new Float32Array([1, 1 / dpr, 1]),
                    strokeCap: new Uint32Array([0, 2, 2]),
                    strokeDash: new Uint32Array([0, 1, 4]),
                    strokeDashOffset: new Float32Array([0, 0, 4]),
                };
                const dashConfig = {
                    count: 3,
                    dashPatterns: [
                        [3, 1, 1, 2],
                        [4, 4],
                        [0, 3],
                        [254, 2],
                        [1, 7],
                    ],
                    channels: {
                        ...Object.fromEntries(
                            Object.entries(dashData).map(([key, data]) => [
                                key,
                                {
                                    data,
                                    type:
                                        data instanceof Uint32Array
                                            ? "u32"
                                            : "f32",
                                },
                            ])
                        ),
                        fill: { value: [1, 0, 0, 1] },
                        stroke: {
                            value: [0, 0, 1, 1],
                            conditions: [
                                {
                                    when: {
                                        selection: "selected",
                                        type: "single",
                                        empty: false,
                                    },
                                    value: [0, 1, 0, 1],
                                },
                            ],
                        },
                    },
                };
                const dashed = renderer.createMark(ruleMark, dashConfig);
                const dashDraws = [{ mark: dashed }];
                const finiteEnd = await capture(
                    [[40 * dpr, 8 * dpr]],
                    dashDraws
                );
                dashed.selections.selected.set(17);
                const selectedBorder = await capture(
                    [[40 * dpr, 8 * dpr]],
                    dashDraws
                );
                dashed.selections.selected.set(0);
                const endPick = await renderer.pick(
                    40 + 0.5 / dpr,
                    8 + 0.5 / dpr
                );
                const roundCut = await capture(
                    [[8 * dpr - 1, 24 * dpr - 3]],
                    dashDraws
                );
                // At the acute corner q=(-3,sqrt(7)), this sample is 1.25px away.
                const acuteCut = await capture([[24, 44]], dashDraws);
                const gapPick = await renderer.pick(
                    14 + 0.5 / dpr,
                    24 + 0.5 / dpr
                );
                const scalar = renderer.createMark(ruleMark, {
                    ...dashConfig,
                    channels: {
                        ...dashConfig.channels,
                        strokeDashOffset: { value: 0, dynamic: true },
                    },
                });
                await capture([], [{ mark: scalar }]);
                const scalarGap = await renderer.pick(
                    14 + 0.5 / dpr,
                    24 + 0.5 / dpr
                );
                scalar.values.strokeDashOffset.set(2);
                await capture([], [{ mark: scalar }]);
                const scalarShift = await renderer.pick(
                    14 + 0.5 / dpr,
                    24 + 0.5 / dpr
                );
                dashData.strokeDashOffset.set([2, 2, 4]);
                dashed.series.replace(dashData, 3);
                await capture([], dashDraws);
                const shiftedPick = await renderer.pick(
                    14 + 0.5 / dpr,
                    24 + 0.5 / dpr
                );
                dashData.strokeDash.fill(2);
                dashed.series.replace(dashData, 3);
                const allOff = await capture([[20 * dpr, 8 * dpr]], dashDraws);
                const emptyPick = await renderer.pick(20, 8);
                dashData.strokeDash.fill(3);
                dashData.strokeWidth.fill(0);
                dashData.strokeDashOffset.fill(250);
                dashed.series.replace(dashData, 3);
                const maxPeriod = await capture(
                    [[13 * dpr, 8 * dpr]],
                    dashDraws
                );
                const periodPick = await renderer.pick(
                    13 + 0.5 / dpr,
                    8 + 0.5 / dpr
                );
                return {
                    caps,
                    crossing,
                    finiteEnd,
                    selectedBorder,
                    scalarGap,
                    scalarShift,
                    endPick,
                    roundCut,
                    acuteCut,
                    gapPick,
                    shiftedPick,
                    allOff,
                    emptyPick,
                    maxPeriod,
                    periodPick,
                    aligned,
                    collapsed,
                    composed,
                    baseline,
                    updates,
                    noBorderPicks,
                    opaque,
                    borderPicks,
                    validation:
                        (await renderer.device.popErrorScope())?.message ??
                        null,
                };
            } finally {
                buffer.destroy();
                renderer.destroy();
                canvas.remove();
            }
        }, dpr);
        expect(result.validation).toBeNull();
        const red = [204, 0, 0, 204],
            blue = [0, 0, 255, 255],
            clear = [0, 0, 0, 0];
        const halfBlue = [0, 0, 128, 128],
            mixed = [102, 0, 128, 229];
        expect(result.aligned).toEqual([
            [red, blue, clear, clear, halfBlue],
            [red, mixed, halfBlue, halfBlue, blue],
            [red, red, blue, blue, mixed],
        ]);
        expect(result.caps).toEqual([
            [halfBlue],
            [blue],
            [mixed],
            [halfBlue],
            [blue],
            [mixed],
        ]);
        expect(result.crossing).toEqual([
            [[26, 128, 0, 153]],
            [[51, 102, 0, 153]],
        ]);
        expect(result.finiteEnd).toEqual([[0, 0, 128, 128]]);
        expect(result.endPick).toBe(17);
        expect(result.selectedBorder).toEqual([[0, 128, 0, 128]]);
        expect(result.scalarGap).toBeNull();
        expect(result.scalarShift).toBe(18);
        expect(result.roundCut).toEqual([[0, 0, 22, 22]]);
        expect(result.acuteCut).toEqual([
            [0, 0, dpr === 1 ? 64 : 0, dpr === 1 ? 64 : 0],
        ]);
        expect(result.gapPick).toBeNull();
        expect(result.shiftedPick).toBe(18);
        expect(result.allOff).toEqual([[0, 0, 0, 0]]);
        expect(result.emptyPick).toBeNull();
        expect(result.maxPeriod).toEqual([[0, 0, 0, 0]]);
        expect(result.periodPick).toBeNull();
        expect(result.collapsed).toEqual([[0, 0, 255, 255]]);
        expect(result.composed).toEqual([
            [51, 0, 0, 51],
            [26, 0, 64, 89],
        ]);
        // Fade is .25; .8 fill alpha and .65 common opacity give .13 premultiplied red.
        const strengths = [17, 17, 66, 66, 17, 0, 0];
        const centerStrengths = [33, 33, 133, 133, 33, 0, 0];
        expect(result.baseline).toEqual(
            strengths.flatMap((v, i) => [
                [v, 0, 0, v],
                [v, 0, 0, v],
                [centerStrengths[i], 0, 0, centerStrengths[i]],
            ])
        );
        for (const update of result.updates)
            update.forEach((pixel, i) => {
                expect(
                    Math.abs(pixel[0] - result.baseline[i][0])
                ).toBeLessThanOrEqual(1);
                expect(pixel[1]).toBe(0);
                expect(pixel[2]).toBeLessThanOrEqual(1);
                expect(
                    Math.abs(pixel[3] - result.baseline[i][3])
                ).toBeLessThanOrEqual(1);
            });
        expect(result.noBorderPicks).toEqual(rowsExpectedIds());
        expect(result.opaque[1]).toEqual([17, 0, 21, 37]);
        expect(result.borderPicks).toEqual([1, 2, 3, 4, 5, null, null]);
    });
}

function rowsExpectedIds() {
    return [1, 2, 3, 4, 5, null, null].flatMap((id) => [id, id, id]);
}
