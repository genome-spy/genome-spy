import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

// Use Core's actual public embedding and selected-backend raster export.
await testRenderers([{ deviceScaleFactor: 1 }], async (page, renderer) => {
    const frames = await page.evaluate(async (renderer) => {
        const { embed } = await import("/index.js");
        await import("/rendering/webgpu/register.js");
        const api = await embed(
            globalThis.document.body,
            {
                width: 80,
                height: 64,
                padding: 0,
                config: { background: null },
                data: { values: [{ ink: "blue" }] },
                params: [{ name: "paint", value: "red" }],
                layer: [
                    {
                        mark: {
                            type: "rule",
                            color: "black",
                            fill: { expr: "paint" },
                            size: 8,
                        },
                        encoding: {
                            x: { value: 0.1 },
                            x2: { value: 0.8 },
                            y: { value: 0.25 },
                        },
                    },
                    {
                        mark: { type: "rule", fill: "yellow", size: 8 },
                        encoding: {
                            x: { value: 0.1 },
                            x2: { value: 0.8 },
                            y: { value: 0.5 },
                            fill: {
                                field: "ink",
                                type: "nominal",
                                scale: {
                                    domain: ["blue"],
                                    range: ["blue"],
                                },
                            },
                        },
                    },
                    {
                        mark: {
                            type: "rule",
                            color: "green",
                            size: 8,
                        },
                        encoding: {
                            x: { value: 0.1 },
                            x2: { value: 0.8 },
                            y: { value: 0.75 },
                        },
                    },
                    {
                        mark: {
                            type: "tick",
                            orient: "vertical",
                            color: "purple",
                            thickness: 4,
                        },
                        encoding: { x: { value: 0.9 } },
                    },
                ],
            },
            { renderer }
        );
        try {
            const frames = [];
            for (const paint of ["red", "orange"]) {
                api.getParam("paint").setValue(paint);
                await new Promise((resolve) =>
                    globalThis.requestAnimationFrame(() =>
                        globalThis.requestAnimationFrame(resolve)
                    )
                );
                // Export samples the actual selected backend, including WebGPU submission.
                const { blob } = await api.imageExport.raster({
                    background: null,
                    pixelRatio: 1,
                });
                const bitmap = await globalThis.createImageBitmap(blob);
                const canvas = new globalThis.OffscreenCanvas(
                    bitmap.width,
                    bitmap.height
                );
                const context = canvas.getContext("2d");
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                frames.push(
                    [
                        [40, 48],
                        [40, 32],
                        [40, 16],
                        [72, 32],
                    ].map(([x, y]) =>
                        Array.from(context.getImageData(x, y, 1, 1).data)
                    )
                );
            }
            return frames;
        } finally {
            api.finalize();
        }
    }, renderer);
    assert.deepEqual(frames, [
        [
            [255, 0, 0, 255],
            [0, 0, 255, 255],
            [0, 128, 0, 255],
            [128, 0, 128, 255],
        ],
        [
            [255, 165, 0, 255],
            [0, 0, 255, 255],
            [0, 128, 0, 255],
            [128, 0, 128, 255],
        ],
    ]);
});
