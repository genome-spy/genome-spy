/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`picking uses mark geometry independently of paint at DPR ${dpr}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const [
                { createRenderer },
                { rectMark },
                { pointMark },
                { ruleMark },
                { textMark },
                { arrowMark },
                { linkMark },
                { identityScale },
                { createTrueTypeFont },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/rect.js"),
                import("/src/marks/point.js"),
                import("/src/marks/rule.js"),
                import("/src/marks/text.js"),
                import("/src/marks/arrow.js"),
                import("/src/marks/link.js"),
                import("/src/scales/identity.js"),
                import("/src/fonts/trueTypeFont.js"),
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
            const hits = {};
            let transparentPixel;
            // Each case uses public renderer configuration and real ID readback.
            /**
             * @param {string} name
             * @param {Parameters<typeof renderer.createMark>[0]} definition
             * @param {Record<string, any>} channels
             * @param {number[][]} points
             * @param {Record<string, any>} [options]
             * @param {Record<string, any>} [draw]
             */
            const check = async (
                name,
                definition,
                channels,
                points,
                options = {},
                draw = {}
            ) => {
                const mark = renderer.createMark(definition, {
                    count: 1,
                    ...options,
                    channels: {
                        uniqueId: { value: 7, type: "u32" },
                        ...Object.fromEntries(
                            Object.entries(channels).map(([key, value]) => [
                                key,
                                /^(x|x2|y|y2)$/.test(key)
                                    ? { scale: identityScale(), ...value }
                                    : value,
                            ])
                        ),
                    },
                });
                renderer.render({
                    draws: [{ mark, ...draw }],
                    clearColor: { r: 0, g: 0, b: 0, a: 0 },
                });
                if (name == "rect") {
                    const buffer = renderer.device.createBuffer({
                        size: 256,
                        usage:
                            GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                    });
                    const encoder = renderer.device.createCommandEncoder();
                    encoder.copyTextureToBuffer(
                        {
                            texture: renderer.context.getCurrentTexture(),
                            origin: [32 * dpr, 32 * dpr],
                        },
                        { buffer, bytesPerRow: 256 },
                        { width: 1, height: 1 }
                    );
                    renderer.device.queue.submit([encoder.finish()]);
                    await buffer.mapAsync(GPUMapMode.READ);
                    transparentPixel = Array.from(
                        new Uint8Array(buffer.getMappedRange()).slice(0, 4)
                    );
                    buffer.unmap();
                    buffer.destroy();
                }
                hits[name] = [];
                for (const [x, y] of points)
                    hits[name].push(await renderer.pick(x, y));
                renderer.destroyMark(mark.markId);
            };
            const rect = {
                x: { value: 16 },
                x2: { value: 48 },
                y: { value: 16 },
                y2: { value: 48 },
                fillOpacity: { value: 0 },
                strokeOpacity: { value: 0 },
            };
            await check("rect", rectMark, rect, [
                [32, 32],
                [12, 32],
            ]);
            const placements = renderer.createPlacementSet({
                rectangles: new Float32Array([0, 0, 1, 1]),
            });
            await check(
                "clippedRect",
                rectMark,
                rect,
                [
                    [24, 32],
                    [40, 32],
                ],
                { placementIndex: { source: "draw" } },
                {
                    placement: { set: placements, index: 0 },
                    scissor: { x: 0, y: 0, width: 32, height: 64 },
                }
            );
            await check(
                "decoratedRect",
                rectMark,
                {
                    ...rect,
                    cornerRadiusTopLeft: { value: 12 },
                    cornerRadiusTopRight: { value: 12 },
                    cornerRadiusBottomLeft: { value: 12 },
                    cornerRadiusBottomRight: { value: 12 },
                    strokeWidth: { value: 2 },
                    shadowOpacity: { value: 1 },
                    shadowBlur: { value: 8 },
                    shadowOffsetX: { value: 6 },
                },
                [
                    [32, 32],
                    [16, 16],
                    [54, 32],
                ]
            );
            const narrowPlacement = renderer.createPlacementSet({
                rectangles: new Float32Array([0, 0, 0.5, 1]),
            });
            await check(
                "placementClip",
                rectMark,
                { ...rect, x2: { value: 96 } },
                [
                    [24, 32],
                    [40, 32],
                ],
                { placementIndex: { source: "draw" } },
                { placement: { set: narrowPlacement, index: 0 } }
            );
            const point = {
                x: { value: 32 },
                y: { value: 32 },
                size: { value: 400 },
                fillOpacity: { value: 0 },
                strokeWidth: { value: 2 },
            };
            await check(
                "hollowCircle",
                pointMark,
                point,
                [
                    [32, 32],
                    [41, 41],
                ],
                { shape: "circle" }
            );
            await check(
                "transparentCircle",
                pointMark,
                { ...point, strokeOpacity: { value: 0 } },
                [
                    [32, 32],
                    [41, 41],
                ],
                { shape: "circle" }
            );
            await check(
                "hollowDiamond",
                pointMark,
                point,
                [
                    [32, 32],
                    [41, 41],
                ],
                { shape: "diamond" }
            );
            const tiny = {
                ...point,
                size: { value: 0.01 },
                strokeOpacity: { value: 0 },
                minPickingSize: { value: 20 },
            };
            await check(
                "tinyCircle",
                pointMark,
                tiny,
                [
                    [36, 32],
                    [41, 41],
                ],
                { shape: "circle" }
            );
            await check(
                "tinySquare",
                pointMark,
                tiny,
                [
                    [36, 32],
                    [44, 44],
                ],
                { shape: "square" }
            );
            const line = {
                x: { value: 16 },
                x2: { value: 48 },
                y: { value: 32 },
                y2: { value: 32 },
                size: { value: 6 },
            };
            await check(
                "dashedRule",
                ruleMark,
                line,
                [
                    [18, 32],
                    [22, 32],
                    [32, 40],
                ],
                { dashPatterns: [[4, 4]] }
            );
            await check(
                "transparentRule",
                ruleMark,
                { ...line, opacity: { value: 0 } },
                [[32, 32]]
            );
            await check(
                "transparentArrow",
                arrowMark,
                {
                    ...line,
                    fillOpacity: { value: 0 },
                    strokeOpacity: { value: 0 },
                },
                [
                    [32, 32],
                    [32, 48],
                ]
            );
            await check(
                "transparentLink",
                linkMark,
                { ...line, opacity: { value: 0 } },
                [
                    [32, 32],
                    [32, 40],
                ],
                { linkShape: "line" }
            );
            const font = createTrueTypeFont(
                await fetch("/src/fonts/DefaultFont.ttf").then((r) =>
                    r.arrayBuffer()
                )
            );
            const text = {
                x: { value: 32 },
                y: { value: 32 },
                text: { value: "O" },
                size: { value: 32 },
                align: { value: 1, type: "u32" },
                baseline: { value: 1, type: "u32" },
            };
            await check(
                "glyphHole",
                textMark,
                text,
                [
                    [32, 32],
                    [2, 32],
                ],
                { font, fontSize: 32 }
            );
            await check(
                "transparentTextEffects",
                textMark,
                {
                    ...text,
                    opacity: { value: 0 },
                    strokeWidth: { value: 2 },
                    shadowOpacity: { value: 1 },
                    shadowOffsetX: { value: 30 },
                },
                [
                    [32, 32],
                    [62, 32],
                ],
                { font, fontSize: 32 }
            );
            const validation = await renderer.device.popErrorScope();
            renderer.destroy();
            canvas.remove();
            return { hits, transparentPixel, validation: validation?.message };
        }, dpr);

        expect(result).toEqual({
            hits: {
                rect: [7, null],
                clippedRect: [7, null],
                placementClip: [7, null],
                decoratedRect: [7, null, null],
                hollowCircle: [7, null],
                transparentCircle: [7, null],
                hollowDiamond: [7, null],
                tinyCircle: [7, null],
                tinySquare: [7, null],
                dashedRule: [7, 7, null],
                transparentRule: [7],
                transparentArrow: [7, null],
                transparentLink: [7, null],
                glyphHole: [7, null],
                transparentTextEffects: [7, null],
            },
            validation: undefined,
            transparentPixel: [0, 0, 0, 0],
        });
    });
}
