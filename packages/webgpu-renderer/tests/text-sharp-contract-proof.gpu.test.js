/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2])
    test(
        "sharp outside union contract DPR " + dpr,
        async ({ page }, testInfo) => {
            await ensureWebGPU(page);
            const result = await page.evaluate(async (dpr) => {
                const [
                    { createRenderer },
                    { textMark },
                    { identityScale },
                    { createTrueTypeFont },
                    { svgPathToGlyphPath },
                ] = await Promise.all([
                    import("/src/index.js"),
                    import("/src/marks/text.js"),
                    import("/src/scales/identity.js"),
                    import("/src/fonts/trueTypeFont.js"),
                    import("/src/vendor/vegaScenegraph/toGlyphPath.js"),
                ]);
                const font = createTrueTypeFont(
                    await fetch("/src/fonts/DefaultFont.ttf").then((r) =>
                        r.arrayBuffer()
                    )
                );
                const canvas = document.createElement("canvas");
                canvas.width = 256 * dpr;
                canvas.height = 128 * dpr;
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
                renderer.updateGlobals({ width: 256, height: 128, dpr });
                renderer.device.pushErrorScope("validation");
                const buffer = renderer.device.createBuffer({
                    size: canvas.width * canvas.height * 4,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                const clamp = (x) => Math.max(0, Math.min(1, x)),
                    size = 32,
                    scale = size / font.unitsPerEm;
                const bar = font.getGlyph("|"),
                    barWidth = (bar.bounds.xMax - bar.bounds.xMin) * scale;
                const rows = [];
                let transparentError = 0;
                // Every oracle rectangle comes directly from original font bounds and
                // pair advances, independently of atlas entries and glyph tile layout.
                function bounds(text, spacing) {
                    const glyphs = Array.from(text, (c) => font.getGlyph(c));
                    const adjustments = glyphs.map(() => ({
                        placement: 0,
                        advance: 0,
                    }));
                    for (let i = 0; i + 1 < glyphs.length; i++) {
                        const p = font.getPairAdjustment(
                            glyphs[i].glyphId,
                            glyphs[i + 1].glyphId
                        );
                        adjustments[i].placement += p.firstPlacement;
                        adjustments[i].advance += p.firstAdvance;
                        adjustments[i + 1].placement += p.secondPlacement;
                        adjustments[i + 1].advance += p.secondAdvance;
                    }
                    const width =
                        glyphs.reduce(
                            (sum, g, i) =>
                                sum +
                                (g.advanceWidth + adjustments[i].advance) *
                                    scale +
                                spacing,
                            0
                        ) - spacing;
                    let pen = 0;
                    return glyphs.map((g, i) => {
                        const b = g.bounds,
                            x =
                                128.25 -
                                width / 2 +
                                pen +
                                adjustments[i].placement * scale;
                        pen +=
                            (g.advanceWidth + adjustments[i].advance) * scale +
                            spacing;
                        const commands = svgPathToGlyphPath(g.path).commands;
                        if (
                            !commands.every((c) =>
                                ["M", "L", "Z"].includes(c.type)
                            )
                        )
                            throw Error("Nonrectangular glyph");
                        return {
                            left: (x + b.xMin * scale) * dpr,
                            right: (x + b.xMax * scale) * dpr,
                            top:
                                (64.25 +
                                    (font.capHeight * scale) / 2 -
                                    b.yMax * scale) *
                                dpr,
                            bottom:
                                (64.25 +
                                    (font.capHeight * scale) / 2 -
                                    b.yMin * scale) *
                                dpr,
                        };
                    });
                }
                async function frame(
                    text,
                    spacing,
                    width,
                    fillAlpha,
                    strokeAlpha,
                    opacity,
                    shadow
                ) {
                    const channels = {
                        text: { data: [text] },
                        uniqueId: { value: 17 },
                        x: { value: 128.25, scale: identityScale() },
                        y: { value: 64.25, scale: identityScale() },
                        size: { value: size },
                        // Gamma is exactly 1 at neutral fill; stroke is distinct red.
                        fill: { value: [0.5, 0.5, 0.5, fillAlpha] },
                        stroke: { value: [1, 0, 0, strokeAlpha] },
                        strokeWidth: { value: width },
                        opacity: { value: opacity },
                    };
                    if (shadow) {
                        channels.shadowColor = { value: [0, 0, 0, 0.5] };
                        channels.shadowOpacity = { value: 0.7 };
                        channels.shadowBlur = { value: 1 };
                        channels.shadowOffsetX = { value: 40 };
                    }
                    const mark = renderer.createMark(textMark, {
                        count: 1,
                        font,
                        fontSize: size,
                        letterSpacing: spacing,
                        channels,
                    });
                    renderer.render({
                        items: [{ mark }],
                        clearColor: { r: 0, g: 0, b: 0, a: 0 },
                    });
                    const e = renderer.device.createCommandEncoder();
                    e.copyTextureToBuffer(
                        { texture: renderer.context.getCurrentTexture() },
                        { buffer, bytesPerRow: canvas.width * 4 },
                        { width: canvas.width, height: canvas.height }
                    );
                    renderer.device.queue.submit([e.finish()]);
                    await buffer.mapAsync(GPUMapMode.READ);
                    const bytes = new Uint8Array(
                        buffer.getMappedRange()
                    ).slice();
                    buffer.unmap();
                    renderer.destroyMark(mark.markId);
                    return bytes;
                }
                function measure(bytes, rects, width, fa, sa, opacity) {
                    let maximum = 0,
                        overTwo = 0,
                        painted = 0,
                        fringe = 0,
                        protectedFill = 0,
                        protectedMaximum = 0,
                        neighborWitness = 0,
                        neighborMaximum = 0,
                        sharpRoundWitness = 0,
                        witnessMaximum = 0,
                        worst = null;
                    const outset = width * dpr;
                    for (let py = 0; py < canvas.height; py++)
                        for (let px = 0; px < canvas.width; px++) {
                            let cf = 0,
                                co = 0,
                                round = 0;
                            for (const dx of [0.25, 0.75])
                                for (const dy of [0.25, 0.75]) {
                                    const x = px + 0.5 + dx,
                                        y = py + 0.5 - dy;
                                    let f = 0,
                                        o = 0,
                                        r = 0;
                                    for (const b of rects) {
                                        const signed = Math.min(
                                            x - b.left,
                                            b.right - x,
                                            y - b.top,
                                            b.bottom - y
                                        );
                                        const outside = Math.hypot(
                                            Math.max(
                                                b.left - x,
                                                0,
                                                x - b.right
                                            ),
                                            Math.max(b.top - y, 0, y - b.bottom)
                                        );
                                        f = Math.max(f, clamp(signed + 0.5));
                                        o = Math.max(
                                            o,
                                            clamp(signed + outset + 0.5)
                                        );
                                        r = Math.max(
                                            r,
                                            clamp(
                                                (outside > 0
                                                    ? -outside
                                                    : signed) +
                                                    outset +
                                                    0.5
                                            )
                                        );
                                    }
                                    cf += f / 4;
                                    co += Math.max(f, o) / 4;
                                    round += Math.max(f, r) / 4;
                                }
                            if (width === 0 || sa === 0) co = cf;
                            const color = [
                                cf * 0.5 * fa + (co - cf) * sa,
                                cf * 0.5 * fa,
                                cf * 0.5 * fa,
                                cf * fa + (co - cf) * sa,
                            ].map((v) => Math.round(v * opacity * 255));
                            const j = (py * canvas.width + px) * 4,
                                actual = Array.from(bytes.slice(j, j + 4));
                            const error = Math.max(
                                ...actual.map((v, c) => Math.abs(v - color[c]))
                            );
                            if (error > maximum) {
                                maximum = error;
                                worst = {
                                    px,
                                    py,
                                    actual,
                                    expected: color,
                                    cf,
                                    co,
                                    round,
                                };
                            }
                            overTwo += error > 2;
                            painted += co > 0;
                            fringe += cf > 0 && cf < 1;
                            if (rects.length > 1 && cf === 1) {
                                protectedFill++;
                                protectedMaximum = Math.max(
                                    protectedMaximum,
                                    error
                                );
                                const x = px + 1,
                                    y = py;
                                const containing = rects.findIndex(
                                    (b) =>
                                        x >= b.left &&
                                        x <= b.right &&
                                        y >= b.top &&
                                        y <= b.bottom
                                );
                                if (
                                    containing >= 0 &&
                                    rects.some(
                                        (b, i) =>
                                            i !== containing &&
                                            Math.min(
                                                x - b.left,
                                                b.right - x,
                                                y - b.top,
                                                b.bottom - y
                                            ) < 0 &&
                                            Math.min(
                                                x - b.left,
                                                b.right - x,
                                                y - b.top,
                                                b.bottom - y
                                            ) >
                                                -outset + 0.5
                                    )
                                ) {
                                    neighborWitness++;
                                    neighborMaximum = Math.max(
                                        neighborMaximum,
                                        error
                                    );
                                }
                            }
                            if (co - round > 0.2) {
                                sharpRoundWitness++;
                                witnessMaximum = Math.max(
                                    witnessMaximum,
                                    error
                                );
                            }
                        }
                    return {
                        maximum,
                        overTwo,
                        painted,
                        fringe,
                        protectedFill,
                        protectedMaximum,
                        neighborWitness,
                        neighborMaximum,
                        sharpRoundWitness,
                        witnessMaximum,
                        worst,
                    };
                }
                try {
                    const spacing = barWidth * 1.5 - bar.advanceWidth * scale;
                    for (const text of ["|", "_", "||"])
                        for (const width of [0, 0.25, 1, 4]) {
                            const s = text.length === 2 ? spacing : 0,
                                rects = bounds(text, s);
                            const nominal = await frame(
                                text,
                                s,
                                0,
                                0.6,
                                0,
                                0.5,
                                false
                            );
                            for (const paint of [
                                { fa: 1, sa: 1, opacity: 1 },
                                { fa: 0.6, sa: 0.4, opacity: 0.5 },
                                { fa: 0.6, sa: 0, opacity: 0.5 },
                            ]) {
                                const bytes = await frame(
                                    text,
                                    s,
                                    width,
                                    paint.fa,
                                    paint.sa,
                                    paint.opacity,
                                    false
                                );
                                if (paint.sa === 0)
                                    transparentError = Math.max(
                                        transparentError,
                                        bytes.reduce(
                                            (max, v, i) =>
                                                Math.max(
                                                    max,
                                                    Math.abs(v - nominal[i])
                                                ),
                                            0
                                        )
                                    );
                                rows.push({
                                    text,
                                    width,
                                    ...paint,
                                    ...measure(
                                        bytes,
                                        rects,
                                        width,
                                        paint.fa,
                                        paint.sa,
                                        paint.opacity
                                    ),
                                });
                            }
                        }
                    const single = await frame("|", 0, 4, 1, 1, 1, false);
                    const duplicate = await frame(
                        "||",
                        -bar.advanceWidth * scale,
                        4,
                        1,
                        1,
                        1,
                        false
                    );
                    const duplicateError = single.reduce(
                        (max, v, i) =>
                            Math.max(max, Math.abs(v - duplicate[i])),
                        0
                    );
                    const validation = await renderer.device.popErrorScope();
                    return {
                        rows,
                        duplicateError,
                        transparentError,
                        validation: validation?.message ?? null,
                        barWidth,
                        adapter: renderer.device.adapterInfo ?? null,
                    };
                } finally {
                    buffer.destroy();
                    renderer.destroy();
                }
            }, dpr);
            await writeFile(
                testInfo.outputPath("results.json"),
                JSON.stringify({ dpr, ...result }, null, 2)
            );
            console.log(
                JSON.stringify({
                    dpr,
                    duplicateError: result.duplicateError,
                    validation: result.validation,
                    rows: result.rows.map((r) => ({
                        text: r.text,
                        width: r.width,
                        fa: r.fa,
                        sa: r.sa,
                        maximum: r.maximum,
                        overTwo: r.overTwo,
                        protectedMaximum: r.protectedMaximum,
                        witnessMaximum: r.witnessMaximum,
                    })),
                })
            );
            expect(result.validation).toBeNull();
            expect(result.transparentError).toBe(0);
            expect(result.duplicateError).toBeLessThanOrEqual(2);
            for (const row of result.rows) {
                expect(row.painted).toBeGreaterThan(10);
                expect(row.maximum).toBeLessThanOrEqual(2);
            }
        }
    );
