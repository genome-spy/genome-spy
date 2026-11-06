/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const [dpr, shift] of [1, 2].flatMap((dpr) =>
    [0, 0.25, 0.5].map((shift) => [dpr, shift])
)) {
    test(`text preserves original glyph and fitted logo bounds at DPR ${dpr}, shift ${shift}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const placement = [dpr, shift];
        const result = await page.evaluate(async ([dpr, shift]) => {
            const [
                { createRenderer },
                { textMark },
                { identityScale },
                { createTrueTypeFont },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/text.js"),
                import("/src/scales/identity.js"),
                import("/src/fonts/trueTypeFont.js"),
            ]);
            const font = createTrueTypeFont(
                await fetch("/src/fonts/DefaultFont.ttf").then((response) =>
                    response.arrayBuffer()
                )
            );
            const canvas = document.createElement("canvas");
            canvas.width = 256 * dpr;
            canvas.height = 128 * dpr;
            document.body.appendChild(canvas);
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
            const size = 32;
            const fontScale = size / font.unitsPerEm;
            const clamp = (value) => Math.max(0, Math.min(1, value));
            const rows = [];

            try {
                for (const { logo, shadow } of [
                    { logo: false, shadow: false },
                    { logo: true, shadow: false },
                    { logo: false, shadow: true },
                ]) {
                    const labels = logo ? ["|"] : ["|", "_"];
                    const x = logo ? [32 + shift] : [64 + shift, 192 + shift];
                    const y = logo ? 112 + shift : 64 + shift;
                    const mark = renderer.createMark(textMark, {
                        count: labels.length,
                        font,
                        fontSize: size,
                        logoLetters: logo,
                        channels: {
                            text: { data: labels },
                            x: {
                                data: new Float32Array(x),
                                type: "f32",
                                scale: identityScale(),
                            },
                            y: { value: y, scale: identityScale() },
                            ...(logo
                                ? {
                                      x2: {
                                          value: 96 + shift,
                                          scale: identityScale(),
                                      },
                                      y2: {
                                          value: 16 + shift,
                                          scale: identityScale(),
                                      },
                                  }
                                : {}),
                            size: { value: size },
                            // Gray gives gamma 1; size 32 has no stem darkening.
                            fill: { value: [0.5, 0.5, 0.5, 1] },
                            strokeWidth: { value: 0 },
                            // Isolate the true-distance shadow shader with the same straight-edge geometry.
                            ...(shadow
                                ? {
                                      fillOpacity: { value: 0 },
                                      shadowOpacity: { value: 1 },
                                      shadowColor: {
                                          value: [0.5, 0.5, 0.5, 1],
                                      },
                                  }
                                : {}),
                        },
                    });
                    let bytes;
                    try {
                        renderer.render({
                            items: [{ mark }],
                            clearColor: { r: 0, g: 0, b: 0, a: 0 },
                        });
                        const encoder = renderer.device.createCommandEncoder();
                        encoder.copyTextureToBuffer(
                            {
                                texture: renderer.context.getCurrentTexture(),
                            },
                            { buffer, bytesPerRow: canvas.width * 4 },
                            { width: canvas.width, height: canvas.height }
                        );
                        renderer.device.queue.submit([encoder.finish()]);
                        await buffer.mapAsync(GPUMapMode.READ);
                        bytes = new Uint8Array(buffer.getMappedRange()).slice();
                        buffer.unmap();
                    } finally {
                        renderer.destroyMark(mark.markId);
                    }

                    for (const [index, label] of labels.entries()) {
                        const glyph = font.getGlyph(label);
                        const bounds = glyph.bounds;
                        // These bars are rectangles in the original font, independent of atlas metrics.
                        const left =
                            (logo
                                ? 32 + shift
                                : x[index] -
                                  (glyph.advanceWidth * fontScale) / 2 +
                                  bounds.xMin * fontScale) * dpr;
                        const right =
                            (logo
                                ? 96 + shift
                                : x[index] -
                                  (glyph.advanceWidth * fontScale) / 2 +
                                  bounds.xMax * fontScale) * dpr;
                        const top =
                            (logo
                                ? 16 + shift
                                : y +
                                  (font.capHeight * fontScale) / 2 -
                                  bounds.yMax * fontScale) * dpr;
                        const bottom =
                            (logo
                                ? 112 + shift
                                : y +
                                  (font.capHeight * fontScale) / 2 -
                                  bounds.yMin * fontScale) * dpr;
                        const gradientX = logo
                            ? ((bounds.xMax - bounds.xMin) * fontScale) / 64
                            : 1;
                        const gradientY = logo
                            ? ((bounds.yMax - bounds.yMin) * fontScale) / 96
                            : 1;
                        const horizontal = right - left > bottom - top;
                        let maximum = 0;
                        let tested = 0;
                        let edges = 0;

                        for (let py = 0; py < canvas.height; py++) {
                            for (let px = 0; px < canvas.width; px++) {
                                // Check straight edges and adjacent background, not finite-field corner accuracy.
                                if (logo) {
                                    if (
                                        Math.abs(
                                            py + 0.5 - (top + bottom) / 2
                                        ) > 0.5 &&
                                        Math.abs(
                                            px + 0.5 - (left + right) / 2
                                        ) > 0.5
                                    )
                                        continue;
                                } else {
                                    if (
                                        px < left - 2 ||
                                        px > right + 2 ||
                                        py < top - 2 ||
                                        py > bottom + 2
                                    )
                                        continue;
                                    if (
                                        horizontal
                                            ? px + 0.5 < left + 2 ||
                                              px + 0.5 > right - 2
                                            : py + 0.5 < top + 2 ||
                                              py + 0.5 > bottom - 2
                                    )
                                        continue;
                                }
                                let coverage = 0;
                                // Sample the current physical pixel at its four quarter-pixel positions.
                                for (const dx of [0.25, 0.75]) {
                                    for (const dy of [0.25, 0.75]) {
                                        const xx = px + dx;
                                        const yy = py + dy;
                                        const distance = Math.min(
                                            (xx - left) * gradientX,
                                            (right - xx) * gradientX,
                                            (yy - top) * gradientY,
                                            (bottom - yy) * gradientY
                                        );
                                        coverage += clamp(distance + 0.5) / 4;
                                    }
                                }
                                const offset = (py * canvas.width + px) * 4;
                                const expected = [127.5, 127.5, 127.5, 255].map(
                                    (value) => Math.round(value * coverage)
                                );
                                for (let channel = 0; channel < 4; channel++) {
                                    maximum = Math.max(
                                        maximum,
                                        Math.abs(
                                            bytes[offset + channel] -
                                                expected[channel]
                                        )
                                    );
                                }
                                tested++;
                                edges += coverage > 0 && coverage < 1;
                            }
                        }
                        rows.push({
                            logo,
                            shadow,
                            label,
                            maximum,
                            tested,
                            edges,
                        });
                    }
                }
                const error = await renderer.device.popErrorScope();
                return { rows, validationError: error?.message ?? null };
            } finally {
                buffer.destroy();
                renderer.destroy();
                canvas.remove();
            }
        }, placement);

        expect(result.validationError).toBeNull();
        expect(result.rows).toHaveLength(5);
        for (const row of result.rows) {
            expect(row.tested, JSON.stringify(row)).toBeGreaterThan(20);
            expect(row.edges, JSON.stringify(row)).toBeGreaterThan(10);
            expect(row.maximum, JSON.stringify(row)).toBeLessThanOrEqual(2);
        }
    });
}
