/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("WGSL bounds acute symbol and glyph strokes like msdfgen", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const gpuOnlyPixels = await page.evaluate(async () => {
        const [
            { createRenderer },
            { createAsciiTrueTypeFont },
            { pathPointMark },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/fonts/trueTypeFont.js"),
            import("/src/marks/pathPoint.js"),
            import("/src/scales/identity.js"),
        ]);
        const response = await fetch("/src/fonts/DefaultFont.ttf");
        const font = createAsciiTrueTypeFont(await response.arrayBuffer());
        const percent = font.characters.get("%");
        const paths = [
            "M0-1L1 1H-1Z",
            "M0-1 .24-.32.95-.31.38.12.59.81 0 .4-.59.81-.38.12-.95-.31-.24-.32Z",
            font.paths[percent.pathIndex],
        ];
        const x = new Float32Array([64, 192, 320, 448]);
        const y = new Float32Array([64, 64, 64, 64]);
        const size = new Float32Array([1600, 1600, 3600, 3600]);
        const shape = new Uint32Array([0, 1, 2, 2]);
        const strokeWidth = new Float32Array([12, 8, 3, 7]);
        const angle = new Float32Array([18, 20, 0, 0]);

        /** @param {"gpu" | "wasm"} backend */
        const render = async (backend) => {
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = 256;
            document.body.appendChild(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width: 512, height: 128, dpr: 2 });
            const handle = renderer.createMark(pathPointMark, {
                count: x.length,
                paths,
                atlasBackend: backend,
                atlasFormat: backend === "gpu" ? "rgba16float" : "rgba8unorm",
                channels: {
                    x: { data: x, type: "f32", scale: identityScale() },
                    y: { data: y, type: "f32", scale: identityScale() },
                    size: { data: size, type: "f32" },
                    shape: { data: shape, type: "u32" },
                    fill: { value: [0.25, 0.75, 0.4, 1] },
                    stroke: { value: [0, 0, 0, 1] },
                    strokeWidth: { data: strokeWidth, type: "f32" },
                    angle: { data: angle, type: "f32" },
                },
            });
            renderer.render({ draws: [{ mark: handle }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const bitmap = await createImageBitmap(
                await (await fetch(canvas.toDataURL("image/png"))).blob()
            );
            const copy = new OffscreenCanvas(canvas.width, canvas.height);
            const context = copy.getContext("2d");
            context.drawImage(bitmap, 0, 0);
            const pixels = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
            ).data;
            renderer.destroy();
            canvas.remove();
            return pixels;
        };

        const gpu = await render("gpu");
        const wasm = await render("wasm");
        let gpuOnly = 0;
        for (let offset = 0; offset < gpu.length; offset += 4) {
            const gpuInk =
                255 - Math.min(gpu[offset], gpu[offset + 1], gpu[offset + 2]);
            const wasmInk =
                255 -
                Math.min(wasm[offset], wasm[offset + 1], wasm[offset + 2]);
            if (gpuInk > 32 && wasmInk <= 4) {
                gpuOnly++;
            }
        }
        return gpuOnly;
    });

    // RGBA16F and WASM RGBA8 differ around antialiased edges. The broken
    // unbounded endpoint fallback produces more than 4,000 extra ink pixels.
    expect(gpuOnlyPixels).toBeLessThan(1000);
});

test("WGSL retains 90-degree corners and star tips like msdfgen", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const mismatches = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { identityScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/identity.js"),
            ]);
        const paths = [
            "M-1-.2H1V.2H-1Z",
            "M-.25-1H.25V-.25H1V.25H.25V1H-.25V.25H-1V-.25H-.25Z",
            "M0-1 .24-.32.95-.31.38.12.59.81 0 .4-.59.81-.38.12-.95-.31-.24-.32Z",
            "M0-1L1 0 0 1-1 0Z",
        ];
        const angles = [37, 45];
        const cellWidth = 76;
        const width = paths.length * cellWidth;
        const height = 180;
        const instances = paths.flatMap((_, pathIndex) =>
            angles.map((angle, row) => ({
                x: (pathIndex + 0.5) * cellWidth,
                y: 50 + row * 80,
                shape: pathIndex,
                angle,
            }))
        );
        const x = Float32Array.from(instances, (instance) => instance.x);
        const y = Float32Array.from(instances, (instance) => instance.y);
        const shape = Uint32Array.from(instances, (instance) => instance.shape);
        const angle = Float32Array.from(
            instances,
            (instance) => instance.angle
        );
        const size = new Float32Array(instances.length).fill(3600);
        const strokeWidth = new Float32Array(instances.length).fill(4);

        /** @param {"gpu" | "wasm"} backend */
        const render = async (backend) => {
            const canvas = document.createElement("canvas");
            canvas.width = width * 2;
            canvas.height = height * 2;
            document.body.appendChild(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width, height, dpr: 2 });
            const handle = renderer.createMark(pathPointMark, {
                count: instances.length,
                paths,
                atlasBackend: backend,
                atlasFormat: "rgba8unorm",
                atlasOptions: {
                    tileSize: 128,
                    spread: 32,
                    shapePadding: 40,
                    gutter: 1,
                },
                channels: {
                    x: { data: x, type: "f32", scale: identityScale() },
                    y: { data: y, type: "f32", scale: identityScale() },
                    size: { data: size, type: "f32" },
                    shape: { data: shape, type: "u32" },
                    fill: { value: [0.12, 0.33, 0.75, 1] },
                    stroke: { value: [0.02, 0.03, 0.06, 1] },
                    strokeWidth: { data: strokeWidth, type: "f32" },
                    angle: { data: angle, type: "f32" },
                },
            });
            renderer.render({ draws: [{ mark: handle }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const bitmap = await createImageBitmap(
                await (await fetch(canvas.toDataURL("image/png"))).blob()
            );
            const copy = new OffscreenCanvas(canvas.width, canvas.height);
            const context = copy.getContext("2d");
            context.drawImage(bitmap, 0, 0);
            const pixels = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
            ).data;
            renderer.destroy();
            canvas.remove();
            return pixels;
        };

        const [gpu, wasm] = await Promise.all([render("gpu"), render("wasm")]);
        const counts = new Array(paths.length).fill(0);
        const pixelCellWidth = cellWidth * 2;
        const canvasWidth = width * 2;
        for (let offset = 0; offset < gpu.length; offset += 4) {
            const gpuInk =
                255 - Math.min(gpu[offset], gpu[offset + 1], gpu[offset + 2]);
            const wasmInk =
                255 -
                Math.min(wasm[offset], wasm[offset + 1], wasm[offset + 2]);
            if (gpuInk >= 128 !== wasmInk >= 128) {
                const pixel = offset / 4;
                const column = pixel % canvasWidth;
                counts[Math.floor(column / pixelCellWidth)]++;
            }
        }
        return counts;
    });

    // Matching RGBA8 atlases isolate generator geometry from quantization.
    expect(mismatches[0]).toBeLessThan(50);
    expect(mismatches[1]).toBeLessThan(100);
    expect(mismatches[2]).toBeLessThan(200);
    expect(mismatches[3]).toBeLessThan(100);
});

test("WGSL star strokes have no deep white seams or detached spikes", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { identityScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/identity.js"),
            ]);
        const paths = [
            "M0-1 .24-.32.95-.31.38.12.59.81 0 .4-.59.81-.38.12-.95-.31-.24-.32Z",
            "M0-1L1 1H-1Z",
        ];
        const sizes = [16, 24, 32];
        const angles = [0, 15, 30, 45];
        const strokeWidths = [1, 4];
        const cellSize = 56;
        const instances = paths.flatMap((_, shape) =>
            sizes.flatMap((size) =>
                angles.flatMap((angle) =>
                    strokeWidths.map((strokeWidth) => ({
                        shape,
                        size,
                        angle,
                        strokeWidth,
                    }))
                )
            )
        );
        const columns = sizes.length * angles.length;
        const rows = paths.length * strokeWidths.length;
        const width = columns * cellSize;
        const height = rows * cellSize;
        const x = Float32Array.from(
            instances,
            (_, index) => ((index % columns) + 0.5) * cellSize
        );
        const y = Float32Array.from(
            instances,
            (_, index) => (Math.floor(index / columns) + 0.5) * cellSize
        );
        const size = Float32Array.from(
            instances,
            (instance) => instance.size ** 2
        );
        const shape = Uint32Array.from(instances, (instance) => instance.shape);
        const angle = Float32Array.from(
            instances,
            (instance) => instance.angle
        );
        const strokeWidth = Float32Array.from(
            instances,
            (instance) => instance.strokeWidth
        );

        /** @param {"gpu" | "wasm"} backend */
        const render = async (backend) => {
            const canvas = document.createElement("canvas");
            canvas.width = width * 2;
            canvas.height = height * 2;
            document.body.appendChild(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width, height, dpr: 2 });
            const handle = renderer.createMark(pathPointMark, {
                count: instances.length,
                paths,
                atlasBackend: backend,
                atlasFormat: backend === "gpu" ? "rgba16float" : "rgba8unorm",
                channels: {
                    x: { data: x, type: "f32", scale: identityScale() },
                    y: { data: y, type: "f32", scale: identityScale() },
                    size: { data: size, type: "f32" },
                    shape: { data: shape, type: "u32" },
                    fill: { value: [0.25, 0.75, 0.4, 1] },
                    stroke: { value: [0, 0, 0, 1] },
                    strokeWidth: { data: strokeWidth, type: "f32" },
                    angle: { data: angle, type: "f32" },
                },
            });
            renderer.render({ draws: [{ mark: handle }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const context = new OffscreenCanvas(canvas.width, canvas.height);
            const context2d = context.getContext("2d");
            context2d.drawImage(canvas, 0, 0);
            const pixels = context2d.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
            ).data;
            renderer.destroy();
            canvas.remove();
            return pixels;
        };

        const [gpu, wasm] = await Promise.all([render("gpu"), render("wasm")]);
        const deepMissing = [0, 0];
        const detachedInk = [0, 0];
        const pixelCellSize = cellSize * 2;
        const pixelWidth = width * 2;
        for (let offset = 0; offset < gpu.length; offset += 4) {
            const gpuInk =
                255 - Math.min(gpu[offset], gpu[offset + 1], gpu[offset + 2]);
            const wasmInk =
                255 -
                Math.min(wasm[offset], wasm[offset + 1], wasm[offset + 2]);
            const pixel = offset / 4;
            const column = Math.floor((pixel % pixelWidth) / pixelCellSize);
            const row = Math.floor(
                Math.floor(pixel / pixelWidth) / pixelCellSize
            );
            const instance = instances[row * columns + column];
            if (wasmInk >= 224 && gpuInk <= 16) {
                deepMissing[instance.shape]++;
            }
            if (gpuInk >= 224 && wasmInk <= 16) {
                detachedInk[instance.shape]++;
            }
        }
        return { deepMissing, detachedInk };
    });

    expect(result.deepMissing[0]).toBeLessThan(10);
    expect(result.detachedInk[0]).toBeLessThan(10);
    expect(result.deepMissing[1]).toBeLessThan(10);
    expect(result.detachedInk[1]).toBeLessThan(10);
});
