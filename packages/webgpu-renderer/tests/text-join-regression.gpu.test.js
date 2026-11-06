/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("font joins retain background and ink in plain and outlined text", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { textMark },
            { identityScale },
            { createTrueTypeFont },
            { svgPathToGlyphPath },
            { renderPathMsdf },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/text.js"),
            import("/src/scales/identity.js"),
            import("/src/fonts/trueTypeFont.js"),
            import("/src/vendor/vegaScenegraph/toGlyphPath.js"),
            import("/tests/oracles/msdfgen/pathRasterizer.js"),
        ]);
        const font = createTrueTypeFont(
            await fetch("/src/fonts/DefaultFont.ttf").then((r) =>
                r.arrayBuffer()
            )
        );
        const rows = [];
        const median = (r, g, b) =>
            Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        for (const dpr of [1, 2]) {
            const canvas = document.createElement("canvas");
            canvas.width = 256 * dpr;
            canvas.height = 128 * dpr;
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
            renderer.updateGlobals({ width: 256, height: 128, dpr });
            renderer.device.pushErrorScope("validation");
            const buffer = renderer.device.createBuffer({
                size: canvas.width * canvas.height * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const references = ["n", "m"].map((letter, index) =>
                renderPathMsdf(svgPathToGlyphPath(font.getGlyph(letter).path), {
                    width: canvas.width,
                    height: canvas.height,
                    scale: (64 * dpr) / font.unitsPerEm,
                    offsetX: [32, 128][index] * dpr,
                    offsetY: 100 * dpr,
                    spread: 8,
                })
            );
            try {
                for (const strokeWidth of [0, 4]) {
                    const mark = renderer.createMark(textMark, {
                        font,
                        fontSize: 64,
                        count: 2,
                        channels: {
                            text: { data: ["n", "m"] },
                            uniqueId: {
                                data: new Uint32Array([17, 18]),
                                type: "u32",
                            },
                            x: {
                                data: new Float32Array([32, 128]),
                                type: "f32",
                                scale: identityScale(),
                            },
                            y: { value: 100, scale: identityScale() },
                            size: { value: 64 },
                            align: { value: 0, type: "u32" },
                            baseline: { value: 0, type: "u32" },
                            fill: { value: [0.5, 0.5, 0.5, 1] },
                            stroke: { value: [0.5, 0.5, 0.5, 1] },
                            strokeWidth: { value: strokeWidth },
                            ...(strokeWidth
                                ? { shadowOpacity: { value: 0, dynamic: true } }
                                : {}),
                        },
                    });
                    renderer.render({
                        items: [{ mark }],
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
                    const pixels = new Uint8Array(
                        buffer.getMappedRange()
                    ).slice();
                    buffer.unmap();
                    for (const [index, letter] of ["n", "m"].entries()) {
                        const sourceX = index ? 308 : 309,
                            sourceY = index ? -872 : -866;
                        const cx =
                            ([32, 128][index] +
                                (sourceX * 64) / font.unitsPerEm) *
                            dpr;
                        const cy =
                            (100 + (sourceY * 64) / font.unitsPerEm) * dpr;
                        const radius = (300 * 64 * dpr) / font.unitsPerEm;
                        let exterior = 0,
                            ink = 0,
                            excess = 0,
                            missing = 0;
                        let worst = null;
                        // Avoid the AA band: qualify detached spikes and deep ink loss,
                        // not full edge parity with the quantized independent oracle.
                        for (
                            let y = Math.floor(cy - radius);
                            y <= Math.ceil(cy + radius);
                            y++
                        ) {
                            for (
                                let x = Math.floor(cx - radius);
                                x <= Math.ceil(cx + radius);
                                x++
                            ) {
                                const i = y * canvas.width + x;
                                const distance =
                                    (median(
                                        ...references[index].buffer.slice(
                                            i * 3,
                                            i * 3 + 3
                                        )
                                    ) /
                                        255 -
                                        0.5) *
                                    16;
                                const alpha = pixels[i * 4 + 3];
                                if (distance < -((strokeWidth * dpr) / 2 + 2)) {
                                    exterior++;
                                    if (alpha > excess) {
                                        excess = alpha;
                                        worst = { x, y, distance, alpha };
                                    }
                                } else if (distance > 2) {
                                    ink++;
                                    missing = Math.max(missing, 255 - alpha);
                                }
                            }
                        }
                        const picked = await renderer.pick(
                            [32, 128][index] + (200 * 64) / font.unitsPerEm,
                            84
                        );
                        rows.push({
                            dpr,
                            strokeWidth,
                            letter,
                            exterior,
                            ink,
                            excess,
                            missing,
                            worst,
                            picked,
                        });
                    }
                    renderer.destroyMark(mark.markId);
                }
                const validation = await renderer.device.popErrorScope();
                if (validation) throw Error(validation.message);
            } finally {
                buffer.destroy();
                renderer.destroy();
            }
        }
        return rows;
    });
    for (const row of result) {
        expect(row.exterior).toBeGreaterThan(0);
        expect(row.ink).toBeGreaterThan(0);
        expect(row.excess, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.missing, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.picked).toBe(row.letter === "n" ? 17 : 18);
    }
});
