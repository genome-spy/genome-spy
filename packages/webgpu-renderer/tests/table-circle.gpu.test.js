/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`table circles match fixed circles at DPR ${dpr}`, async ({
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
            const config = {
                count: 3,
                placementIndex: { source: "draw" },
                channels: {
                    x: {
                        data: new Float32Array([28.25, 32.25, 36.25]),
                        type: "f32",
                        scale: identityScale(),
                    },
                    y: { value: 32.25, scale: identityScale() },
                    uniqueId: {
                        data: new Uint32Array([17, 18, 19]),
                        type: "u32",
                    },
                    // Encoded, duplicate circle names share a table with unrelated entries.
                    shape: { data: new Uint32Array([0, 2, 0]), type: "u32" },
                    fill: {
                        data: new Float32Array([
                            1, 0.2, 0.1, 0.8, 0.2, 1, 0.1, 0.7, 1, 1, 0.1, 0.6,
                        ]),
                        type: "f32",
                        components: 4,
                    },
                    size: dynamic(64),
                    strokeWidth: dynamic(2),
                    stroke: dynamic([0.1, 0.2, 1, 0.5]),
                    fillOpacity: dynamic(0.8),
                    strokeOpacity: dynamic(0.6),
                    gradientStrength: dynamic(0),
                    minPickingSize: dynamic(2),
                    angle: dynamic(0),
                    strokeAlign: { ...dynamic(1), type: "u32" },
                },
            };
            const fixed = renderer.createMark(pointMark, {
                ...config,
                shape: "circle",
            });
            const table = renderer.createMark(pointMark, {
                ...config,
                shapes: [
                    "circle",
                    "square",
                    "circle",
                    "x",
                    "+",
                    "M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z",
                ],
            });
            const set = (values) => {
                for (const mark of [fixed, table])
                    mark.batchUpdates(() => {
                        for (const [name, value] of Object.entries(values))
                            mark.values[name].set(value);
                    });
            };
            const capture = async (mark, clipped = false) => {
                renderer.render({
                    items: [
                        {
                            mark,
                            placement: {
                                set: placement,
                                index: 0,
                                clipToPlacement: "xy",
                            },
                            ...(clipped
                                ? {
                                      scissor: {
                                          x: 0,
                                          y: 0,
                                          width: 34,
                                          height: 64,
                                      },
                                  }
                                : {}),
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
                const picks = [];
                for (const [x, y] of [
                    [28.25, 32.25],
                    [32.25, 32.25],
                    [36.25, 32.25],
                    [42.25, 32.25],
                    [32.25, 48],
                    [1, 1],
                ]) {
                    picks.push(await renderer.pick(x, y));
                }
                return { bytes, picks };
            };
            const defaults = {
                size: 64,
                strokeWidth: 2,
                stroke: [0.1, 0.2, 1, 0.5],
                fillOpacity: 0.8,
                strokeOpacity: 0.6,
                gradientStrength: 0,
                minPickingSize: 2,
                angle: 0,
                strokeAlign: 1,
            };
            const cases = [];
            try {
                let original;
                let restored = false;
                for (const state of [
                    {},
                    { size: 0.01, strokeWidth: 12 },
                    { size: 0, strokeWidth: 12 },
                    { size: 4, strokeWidth: 16, strokeAlign: 0 },
                    { size: 4, strokeWidth: 16, strokeAlign: 2 },
                    { size: 4, strokeWidth: 16, stroke: [0, 0, 1, 0] },
                    { size: 4, strokeWidth: 16, strokeOpacity: 0 },
                    { fillOpacity: 0 },
                    { gradientStrength: 0.7 },
                    { size: 0, strokeWidth: 0, gradientStrength: 0.00001 },
                    { size: 0.01, strokeWidth: 0, minPickingSize: 14 },
                    { size: 4, strokeWidth: 16, angle: 33 },
                    { clipped: true },
                    {},
                ]) {
                    const { clipped, ...values } = state;
                    set({ ...defaults, ...values });
                    const reference = await capture(fixed, clipped);
                    const actual = await capture(table, clipped);
                    let error = 0;
                    for (let i = 0; i < actual.bytes.length; i++)
                        error = Math.max(
                            error,
                            Math.abs(actual.bytes[i] - reference.bytes[i])
                        );
                    cases.push({
                        state,
                        visible: actual.bytes.some(Boolean),
                        error,
                        fixedPicks: reference.picks,
                        tablePicks: actual.picks,
                    });
                    original ??= actual.bytes;
                    restored = original.every((v, i) => v === actual.bytes[i]);
                }
                // Retained slot changes preserve duplicate identity and leave paths alone.
                const payload = {
                    x: config.channels.x.data,
                    uniqueId: config.channels.uniqueId.data,
                    fill: config.channels.fill.data,
                    shape: new Uint32Array([2, 0, 2]),
                };
                const circles = await capture(table);
                table.series.replace(payload, 3);
                const swapped = await capture(table);
                payload.shape = new Uint32Array([1, 3, 5]);
                table.series.replace(payload, 3);
                const mixed = await capture(table);
                const paths = renderer.createMark(pointMark, {
                    ...config,
                    shapes: [
                        "circle",
                        "square",
                        "circle",
                        "x",
                        "+",
                        "M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z",
                    ].map(resolvePointShape),
                    channels: {
                        ...config.channels,
                        shape: { data: payload.shape, type: "u32" },
                    },
                });
                const referencePaths = await capture(paths);
                renderer.destroyMark(paths.markId);
                const same = (a, b) =>
                    a.length === b.length &&
                    a.every((value, i) => value === b[i]);
                const swappedExact =
                    same(circles.bytes, swapped.bytes) &&
                    same(circles.picks, swapped.picks);
                const pathsExact =
                    same(mixed.bytes, referencePaths.bytes) &&
                    same(mixed.picks, referencePaths.picks);
                payload.shape = config.channels.shape.data;
                table.series.replace(payload, 3);
                // Negative circles stay hidden before minimum-picking enlargement.
                set({ size: -1 });
                const negative = await capture(table);
                return {
                    cases,
                    restored,
                    swappedExact,
                    pathsExact,
                    negativeInk: negative.bytes.some(Boolean),
                    negativePicks: negative.picks,
                    validation: await renderer.device.popErrorScope(),
                };
            } finally {
                placement.destroy();
                buffer.destroy();
                renderer.destroy();
                canvas.remove();
            }
        }, dpr);
        for (const item of result.cases) {
            expect(item.error, JSON.stringify(item.state)).toBeLessThanOrEqual(
                2
            );
            expect(item.tablePicks, JSON.stringify(item.state)).toEqual(
                item.fixedPicks
            );
        }
        expect(result.cases[0].visible).toBe(true);
        expect(result.cases[0].tablePicks[2]).toBe(19);
        expect(result.restored).toBe(true);
        expect(result.swappedExact).toBe(true);
        expect(result.pathsExact).toBe(true);
        expect(result.negativeInk).toBe(false);
        expect(result.negativePicks.every((pick) => pick === null)).toBe(true);
        expect(result.validation).toBeNull();
    });
}
