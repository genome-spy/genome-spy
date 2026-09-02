/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("PathPoint renders and picks an MSDF path with an outline", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/linear.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const handle = renderer.createMark(pathPointMark, {
            count: 1,
            paths: ["M-1-1H1V1H-1Z"],
            channels: {
                uniqueId: { data: new Uint32Array([7]), type: "u32" },
                x: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                y: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                size: { value: 400 },
                shape: { value: 0 },
                fill: { value: [0.2, 0.4, 0.8, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: 4 },
                angle: { value: 30 },
            },
        });

        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const center = await renderer.pick(32, 32);
        const outside = await renderer.pick(4, 4);
        renderer.destroy();
        canvas.remove();
        return { center, outside };
    });

    expect(result).toEqual({ center: 7, outside: null });
});

test("PathPoint marks share an exact renderer-owned GPU atlas", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/linear.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 1 });
        const config = {
            count: 1,
            paths: ["M-1-1H1V1H-1Z"],
            atlasFormat: "rgba16float",
            channels: {
                uniqueId: { data: new Uint32Array([17]), type: "u32" },
                x: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                y: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                size: { value: 400 },
                shape: { value: 0 },
                fill: { value: [0.2, 0.4, 0.8, 1] },
            },
        };
        const first = renderer.createMark(pathPointMark, config);
        const second = renderer.createMark(pathPointMark, config);
        const programs = Array.from(renderer._marks.values());
        const sharedTexture =
            programs[0]._extraTextures.get("pathAtlas").texture ===
            programs[1]._extraTextures.get("pathAtlas").texture;
        const sharedEntries =
            programs[0]._extraBuffers.get("pathAtlasEntries") ===
            programs[1]._extraBuffers.get("pathAtlasEntries");

        renderer.destroyMark(first.markId);
        renderer.render({ draws: [{ mark: second }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const picked = await renderer.pick(32, 32);
        renderer.destroy();
        canvas.remove();
        return { sharedTexture, sharedEntries, picked };
    });

    expect(result).toEqual({
        sharedTexture: true,
        sharedEntries: true,
        picked: 17,
    });
});

test("PathPoint retains an acute miter inside its path-specific quad", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/linear.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const handle = renderer.createMark(pathPointMark, {
            count: 1,
            paths: ["M0-1L1 1H-1Z"],
            channels: {
                uniqueId: { data: new Uint32Array([11]), type: "u32" },
                x: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                y: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                size: { value: 400 },
                shape: { value: 0 },
                fill: { value: [0.2, 0.4, 0.8, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: 4 },
            },
        });

        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const miter = await renderer.pick(32, 18);
        const beyondMiter = await renderer.pick(32, 16);
        renderer.destroy();
        canvas.remove();
        return { miter, beyondMiter };
    });

    expect(result).toEqual({ miter: 11, beyondMiter: null });
});

test("PathPoint bounds thick-stroke pseudo-distances to corner miters", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/linear.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 128, height: 128, dpr: 2 });
        const handle = renderer.createMark(pathPointMark, {
            count: 1,
            paths: ["M-.35-1H.35V-.35H1V.35H.35V1H-.35V.35H-1V-.35H-.35Z"],
            atlasFormat: "rgba16float",
            channels: {
                uniqueId: { data: new Uint32Array([17]), type: "u32" },
                x: {
                    value: 64,
                    scale: linearScale({ domain: [0, 128], range: [0, 128] }),
                },
                y: {
                    value: 64,
                    scale: linearScale({ domain: [0, 128], range: [0, 128] }),
                },
                size: { value: 3600 },
                shape: { value: 0 },
                fill: { value: [0.95, 0.55, 0.2, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: 12 },
                angle: { value: 45 },
            },
        });

        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const center = await renderer.pick(64, 64);
        const detached = await Promise.all([
            renderer.pick(64, 20),
            renderer.pick(64, 108),
            renderer.pick(20, 64),
            renderer.pick(108, 64),
        ]);
        renderer.destroy();
        canvas.remove();
        return { center, detached };
    });

    expect(result).toEqual({
        center: 17,
        detached: [null, null, null, null],
    });
});

test("PathPoint retains symmetric circle coverage near quad boundaries", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { pathPointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/pathPoint.js"),
                import("/src/scales/linear.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const handle = renderer.createMark(pathPointMark, {
            count: 1,
            paths: ["M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z"],
            atlasFormat: "rgba16float",
            channels: {
                uniqueId: { data: new Uint32Array([13]), type: "u32" },
                x: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                y: {
                    value: 32,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                size: { value: 400 },
                shape: { value: 0 },
                fill: { value: [0.95, 0.55, 0.2, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: 4 },
            },
        });

        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const boundary = await Promise.all([
            renderer.pick(32, 21),
            renderer.pick(32, 43),
            renderer.pick(21, 32),
            renderer.pick(43, 32),
        ]);
        const outside = await renderer.pick(32, 47);
        renderer.destroy();
        canvas.remove();
        return { boundary, outside };
    });

    expect(result).toEqual({ boundary: [13, 13, 13, 13], outside: null });
});

test("rotated diamond coverage retains a guard band inside its quad", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pathPointMark },
            { identityScale },
            { buildSparsePathAtlasLayout },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/pathPoint.js"),
            import("/src/scales/identity.js"),
            import("/src/symbols/sparsePathAtlasLayout.js"),
        ]);
        const path = "M0-1L1 0 0 1-1 0Z";
        const diameter = 30;
        const strokeWidth = 4;
        const angleDegrees = 37;
        const dpr = 2;
        const center = 40;
        const canvas = document.createElement("canvas");
        canvas.width = 80 * dpr;
        canvas.height = 80 * dpr;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 80, height: 80, dpr });
        const handle = renderer.createMark(pathPointMark, {
            count: 1,
            paths: [path],
            atlasFormat: "rgba16float",
            channels: {
                x: { value: center, scale: identityScale() },
                y: { value: center, scale: identityScale() },
                size: { value: diameter ** 2 },
                shape: { value: 0 },
                fill: { value: [0.25, 0.75, 0.4, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: strokeWidth },
                angle: { value: angleDegrees },
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
        const layout = buildSparsePathAtlasLayout([path]);
        const localBounds = layout.entries.slice(4, 8);
        const strokePadding = layout.entries.slice(8, 12);
        const coverageRadius = strokeWidth * 0.5 + 0.5 / dpr;
        const rasterSafety = 3 / dpr;
        const localMin = [
            localBounds[0] * diameter -
                strokePadding[0] * coverageRadius -
                rasterSafety,
            localBounds[1] * diameter -
                strokePadding[1] * coverageRadius -
                rasterSafety,
        ];
        const localMax = [
            localBounds[2] * diameter +
                strokePadding[2] * coverageRadius +
                rasterSafety,
            localBounds[3] * diameter +
                strokePadding[3] * coverageRadius +
                rasterSafety,
        ];
        const angle = (angleDegrees * Math.PI) / 180;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        let minimumMargin = Infinity;
        let coveredPixels = 0;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const offset = (y * canvas.width + x) * 4;
                const ink =
                    255 -
                    Math.min(
                        pixels[offset],
                        pixels[offset + 1],
                        pixels[offset + 2]
                    );
                if (ink <= 4) {
                    continue;
                }
                coveredPixels++;
                const screenX = (x + 0.5) / dpr - center;
                const screenY = (y + 0.5) / dpr - center;
                const localX = cosine * screenX - sine * screenY;
                const localY = sine * screenX + cosine * screenY;
                minimumMargin = Math.min(
                    minimumMargin,
                    localX - localMin[0],
                    localY - localMin[1],
                    localMax[0] - localX,
                    localMax[1] - localY
                );
            }
        }
        renderer.destroy();
        canvas.remove();
        return { minimumMargin, coveredPixels };
    });

    expect(result.coveredPixels).toBeGreaterThan(0);
    expect(result.minimumMargin).toBeGreaterThan(0.75);
});

test("embedded msdfgen initializes in a module worker", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
        const moduleUrl = location.origin + "/src/symbols/pathAtlas.js";
        const source = `
            import { buildPathAtlas } from ${JSON.stringify(moduleUrl)};
            self.onmessage = () => {
                const atlas = buildPathAtlas(["M-1-1H1V1H-1Z"], {
                    tileSize: 32,
                    spread: 8,
                    shapePadding: 10,
                    gutter: 1,
                });
                self.postMessage({ width: atlas.width, height: atlas.height });
            };
        `;
        const worker = new Worker(
            URL.createObjectURL(
                new Blob([source], { type: "text/javascript" })
            ),
            { type: "module" }
        );
        try {
            return await new Promise((resolve, reject) => {
                worker.onmessage = (event) => resolve(event.data);
                worker.onerror = reject;
                worker.postMessage(null);
            });
        } finally {
            worker.terminate();
        }
    });

    expect(result).toEqual({ width: 34, height: 34 });
});
