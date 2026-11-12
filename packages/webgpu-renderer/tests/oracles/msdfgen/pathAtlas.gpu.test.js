/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "../../gpuTestUtils.js";

test("canonical msdfgen oracle initializes in a module worker", async ({
    page,
}) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
        const moduleUrl =
            location.origin + "/tests/oracles/msdfgen/pathAtlas.js";
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

test("comparison atlases preserve zero distance and signed coverage", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const rows = await page.evaluate(async () => {
        const [
            { createRenderer },
            { comparisonPathPointMark },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/tests/oracles/msdfgen/pathPointMark.js"),
            import("/src/scales/identity.js"),
        ]);
        const rows = [];
        for (const backend of ["wasm", "gpu-rgba8"])
            for (const dpr of [1, 2]) {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 64;
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
                renderer.updateGlobals({
                    width: 64 / dpr,
                    height: 64 / dpr,
                    dpr,
                });
                renderer.device.pushErrorScope("validation");
                const mark = renderer.createMark(comparisonPathPointMark, {
                    count: 1,
                    paths: ["M-1-1H1V1H-1Z"],
                    atlasBackend: backend,
                    atlasOptions: {
                        tileSize: 64,
                        shapePadding: 24,
                        spread: 8,
                        normalizationSpan: 2,
                    },
                    channels: {
                        x: {
                            value: 32.5 / dpr,
                            dynamic: true,
                            scale: identityScale(),
                        },
                        y: { value: 32.5 / dpr, scale: identityScale() },
                        size: { value: (16 / dpr) ** 2 },
                        fill: { value: [1, 1, 1, 1] },
                        strokeWidth: { value: 0 },
                        uniqueId: { value: 17, type: "u32" },
                    },
                });
                const buffer = renderer.device.createBuffer({
                    size: 64 * 64 * 4,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                async function capture() {
                    renderer.render({
                        items: [{ mark }],
                        clearColor: { r: 0, g: 0, b: 0, a: 0 },
                    });
                    const encoder = renderer.device.createCommandEncoder();
                    encoder.copyTextureToBuffer(
                        { texture: renderer.context.getCurrentTexture() },
                        { buffer, bytesPerRow: 256 },
                        { width: 64, height: 64 }
                    );
                    renderer.device.queue.submit([encoder.finish()]);
                    await buffer.mapAsync(GPUMapMode.READ);
                    const pixels = new Uint8Array(
                        buffer.getMappedRange()
                    ).slice();
                    buffer.unmap();
                    return pixels;
                }
                try {
                    const centered = await capture();
                    mark.values.x.set(32 / dpr);
                    const shifted = await capture();
                    /** @param {Uint8Array} pixels @param {number} x */
                    const alpha = (pixels, x) => pixels[(32 * 64 + x) * 4 + 3];
                    rows.push({
                        backend,
                        dpr,
                        zero: [alpha(centered, 24), alpha(centered, 40)],
                        inside: alpha(shifted, 39),
                        outside: alpha(shifted, 40),
                        ink: alpha(shifted, 32),
                        empty: alpha(shifted, 42),
                        picked: await renderer.pick(32 / dpr, 32.5 / dpr),
                        validation:
                            (await renderer.device.popErrorScope())?.message ??
                            null,
                    });
                } finally {
                    buffer.destroy();
                    renderer.destroy();
                }
            }
        return rows;
    });
    for (const row of rows) {
        expect(row.validation).toBeNull();
        // The zero contour lies midway between opposing encoded distances.
        for (const alpha of row.zero)
            expect(
                Math.abs(alpha - 127.5),
                JSON.stringify(row)
            ).toBeLessThanOrEqual(0.5);
        // At +/-0.5 atlas pixels the RGBA8 encoder produces bytes135/120.
        // Decoding their full range yields coverage247.5/7.5 before output rounding.
        expect(
            Math.abs(row.inside - 247.5),
            JSON.stringify(row)
        ).toBeLessThanOrEqual(0.5);
        expect(
            Math.abs(row.outside - 7.5),
            JSON.stringify(row)
        ).toBeLessThanOrEqual(0.5);
        expect(row.ink).toBe(255);
        expect(row.empty).toBe(0);
        expect(row.picked).toBe(17);
    }
});
