/* global document, Image, OffscreenCanvas */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`text foreground composition at DPR ${dpr}`, async ({ page }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(renderText, dpr);
        for (const [actual, expected] of result.samples) {
            actual.forEach((value, i) =>
                expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(1)
            );
        }
        expect(result.opaqueMinimum).toBe(255);
        expect(result.opacityError).toBeLessThanOrEqual(1);
        expect(result.transparentError).toBeLessThanOrEqual(1);
        expect(result.orderError).toBeLessThanOrEqual(2);
        expect(result.overlap).toBeGreaterThan(10);
        expect(result.reverseDifference).toBeGreaterThan(10);
        expect(result.emptyRange).toBe(true);
        expect(result.rangePicks).toEqual([11, null, 13]);
        expect(result.bottomPicks).toEqual([11, null]);
        for (const geometry of result.geometry) {
            expect(geometry.foreground).toBeGreaterThan(10);
            expect(geometry.background).toBeGreaterThan(1000);
            expect(geometry.mismatches).toBe(0);
        }
        expect(result.quadPicks).toEqual([31, null]);
        expect(result.counterAlpha).toBe(0);
        expect(result.fadeError).toBeLessThanOrEqual(1);
        expect(result.fadeCenter).toBeGreaterThan(10);
        expect(result.error).toBeNull();
    });
}

/** @param {number} dpr */
async function renderText(dpr) {
    const [
        { createRenderer },
        { textMark },
        { identityScale },
        { createTrueTypeFont },
        { createSyntheticOutlineFont },
    ] = await Promise.all([
        import("/src/index.js"),
        import("/src/marks/text.js"),
        import("/src/scales/identity.js"),
        import("/src/fonts/trueTypeFont.js"),
        import("/tests/fixtures/syntheticOutlineFont.js"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = 256 * dpr;
    canvas.height = 128 * dpr;
    document.body.append(canvas);
    const renderer = await createRenderer(canvas, { format: "rgba8unorm" });
    renderer.context.configure({
        device: renderer.device,
        format: renderer.format,
        alphaMode: "premultiplied",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    renderer.updateGlobals({ width: 256, height: 128, dpr });
    renderer.device.pushErrorScope("validation");
    const buffer = renderer.device.createBuffer({
        size: canvas.width * canvas.height * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const font = createSyntheticOutlineFont(2);
    const x = new Float32Array([80, 0, 90]);
    const fill = new Float32Array([1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1]);
    const uniqueId = new Uint32Array([11, 12, 13]);
    const mark = renderer.createMark(textMark, {
        count: 3,
        font,
        fontSize: 40,
        letterSpacing: -10,
        channels: {
            text: { data: ["ĀĀ", "", "Ā"] },
            x: { data: x, type: "f32", scale: identityScale() },
            y: { value: 64, scale: identityScale(), dynamic: true },
            uniqueId: { data: uniqueId, type: "u32" },
            align: { value: 0, type: "u32" },
            size: { value: 40, dynamic: true },
            angle: { value: 0, dynamic: true },
            fill: { data: fill, type: "f32", components: 4 },
            fillOpacity: { value: 0.6, dynamic: true },
            stroke: { value: [0, 0, 1, 1] },
            strokeWidth: { value: 4, dynamic: true },
            strokeOpacity: { value: 0.5, dynamic: true },
            opacity: { value: 1, dynamic: true },
            shadowOpacity: { value: 0, dynamic: true },
            shadowColor: { value: [0, 0, 0, 1] },
            shadowBlur: { value: 2 },
            shadowOffsetX: { value: 5 },
            shadowOffsetY: { value: 2 },
        },
    });
    /** @param {number} firstInstance */
    const draw = (firstInstance) => ({ mark, firstInstance, instanceCount: 1 });
    /** @param {object[]} [items] */
    const capture = async (items = [draw(0)]) => {
        renderer.render({ items, clearColor: { r: 0, g: 0, b: 0, a: 0 } });
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
        return bytes;
    };
    /** @param {Uint8Array} bytes @param {number} x @param {number} y */
    const pixel = (bytes, x, y) =>
        Array.from(
            bytes.slice(
                (y * dpr * canvas.width + x * dpr) * 4,
                (y * dpr * canvas.width + x * dpr) * 4 + 4
            )
        );
    /** @param {Uint8Array} a @param {Uint8Array} b @param {number} [scale] */
    const difference = (a, b, scale = 1) =>
        a.reduce(
            (error, value, i) =>
                Math.max(error, Math.abs(value - b[i] * scale)),
            0
        );
    /** @param {Record<string, number>} values */
    const set = (values) =>
        mark.batchUpdates(() => {
            for (const [key, value] of Object.entries(values))
                mark.values[key].set(value);
        });
    try {
        const painted = await capture();
        const samples = [
            [pixel(painted, 95, 64), [153, 0, 0, 153]],
            [pixel(painted, 99, 64), [77, 0, 128, 204]],
        ];
        // The first glyph's outside contour remains visible inside the next glyph.
        set({ opacity: 0.5 });
        const opacityError = difference(await capture(), painted, 0.5);
        set({ opacity: 1, strokeOpacity: 0, strokeWidth: 8 });
        const transparent = await capture();
        set({ strokeWidth: 0 });
        const transparentError = difference(await capture(), transparent);
        set({ strokeWidth: 4, strokeOpacity: 1, fillOpacity: 1 });
        const opaque = await capture();
        let opaqueMinimum = 255;
        for (let x = 78; x <= 108; x++)
            opaqueMinimum = Math.min(opaqueMinimum, pixel(opaque, x, 64)[3]);
        set({ opacity: 0.5, strokeOpacity: 0.5, fillOpacity: 0.6 });
        let orderError = 0,
            overlap = 0,
            reverseDifference = 0;
        for (const shadowOpacity of [0, 0.5]) {
            set({ shadowOpacity });
            const first = await capture([draw(0)]),
                last = await capture([draw(2)]);
            const all = await capture([{ mark }]);
            for (let i = 0; i < all.length; i += 4) {
                if (first[i + 3] > 0 && last[i + 3] > 0) overlap++;
                for (let j = 0; j < 4; j++)
                    orderError = Math.max(
                        orderError,
                        Math.abs(
                            all[i + j] -
                                (last[i + j] +
                                    first[i + j] * (1 - last[i + 3] / 255))
                        )
                    );
            }
            reverseDifference = Math.max(
                reverseDifference,
                difference(await capture([draw(2), draw(0)]), all)
            );
        }
        const emptyRange = (await capture([draw(1)])).every(
            (value) => value === 0
        );
        const rangePicks = [];
        for (const first of [0, 1, 2]) {
            await capture([draw(first)]);
            rangePicks.push(await renderer.pick(90, 64));
        }
        // Preserve the old padded quad's lower edge, including transparent pixels.
        // The synthetic glyph ends at y=90.05; adding one atlas pixel picks below it.
        set({ y: 64.5 });
        await capture();
        const bottomPicks = [
            await renderer.pick(90, 89),
            await renderer.pick(90, 90),
        ];
        set({ y: 64 });
        mark.series.replace({ text: ["ĀāĀ", "", "āĀ"], x, fill, uniqueId });
        set({
            opacity: 1,
            fillOpacity: 1,
            strokeOpacity: 1,
            shadowOpacity: 0,
            angle: 23,
        });
        const geometry = [
            compareGeometry(
                await capture(),
                await glyphReference(font, "ĀāĀ", 80, 40, -10, 23)
            ),
        ];
        renderer.destroyMark(mark.markId);

        const outlineFont = createTrueTypeFont(
            await fetch("/src/fonts/DefaultFont.ttf").then((response) =>
                response.arrayBuffer()
            )
        );
        const glyphMark = renderer.createMark(textMark, {
            count: 1,
            font: outlineFont,
            fontSize: 40,
            channels: {
                text: { data: ["A"] },
                x: { value: 100, scale: identityScale() },
                y: { value: 64, scale: identityScale() },
                align: { value: 0, type: "u32" },
                size: { value: 40 },
                strokeWidth: { value: 4, dynamic: true },
                uniqueId: { value: 31, type: "u32" },
            },
        });
        geometry.push(
            compareGeometry(
                await capture([{ mark: glyphMark }]),
                await glyphReference(outlineFont, "A", 100, 40, 0, 0)
            )
        );
        glyphMark.values.strokeWidth.set(0);
        glyphMark.series.replace({ text: ["O"] });
        const counter = outlineFont.getGlyph("O").bounds;
        const cx =
            100 + ((counter.xMin + counter.xMax) * 20) / outlineFont.unitsPerEm;
        const cy =
            64 +
            ((outlineFont.capHeight - counter.yMin - counter.yMax) * 20) /
                outlineFont.unitsPerEm;
        const counterFrame = await capture([{ mark: glyphMark }]);
        const counterAlpha =
            counterFrame[
                (Math.floor(cy * dpr) * canvas.width + Math.floor(cx * dpr)) *
                    4 +
                    3
            ];
        const quadPicks = [await renderer.pick(cx, cy)];
        glyphMark.series.replace({ text: ["A" + " ".repeat(100) + "A"] });
        await capture([{ mark: glyphMark }]);
        quadPicks.push(await renderer.pick(200, 64));
        renderer.destroyMark(glyphMark.markId);

        const fadeMark = renderer.createMark(textMark, {
            count: 1,
            font,
            fontSize: 40,
            viewport: [0, 0, 256, 128],
            viewportEdgeFadeWidth: [1, 40, 1, 40],
            channels: {
                text: { value: "Ā".repeat(12) },
                x: { value: 128, scale: identityScale() },
                y: { value: 64, scale: identityScale() },
                size: { value: 40 },
            },
        });
        const unfaded = await capture([{ mark: fadeMark }]);
        fadeMark.properties.viewportEdgeFadeDistance.set([
            -Infinity,
            0,
            -Infinity,
            0,
        ]);
        const faded = await capture([{ mark: fadeMark }]);
        let fadeError = 0,
            fadeCenter = 0;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                const factor = Math.max(
                    0,
                    Math.min(
                        1,
                        (x + 0.5) / dpr / 40,
                        (256 - (x + 0.5) / dpr) / 40
                    )
                );
                if (x > 100 * dpr && x < 156 * dpr && faded[i + 3] > 0)
                    fadeCenter++;
                for (let j = 0; j < 4; j++)
                    fadeError = Math.max(
                        fadeError,
                        Math.abs(faded[i + j] - unfaded[i + j] * factor)
                    );
            }
        }
        renderer.destroyMark(fadeMark.markId);
        return {
            samples,
            opacityError,
            transparentError,
            opaqueMinimum,
            orderError,
            overlap,
            reverseDifference,
            emptyRange,
            rangePicks,
            bottomPicks,
            geometry,
            counterAlpha,
            quadPicks,
            fadeError,
            fadeCenter,
            error: (await renderer.device.popErrorScope())?.message ?? null,
        };
    } finally {
        buffer.destroy();
        renderer.destroy();
        canvas.remove();
    }

    /**
     * Independent raw glyph paths establish nominal/outside geometry with round
     * offsets. These fixtures have no pair adjustments; no renderer layout is reused.
     * @param {object} font @param {string} text @param {number} x @param {number} size @param {number} spacing @param {number} angle
     */
    async function glyphReference(font, text, x, size, spacing, angle) {
        const scale = size / font.unitsPerEm,
            baseline = (font.capHeight * scale) / 2;
        let pen = 0;
        const paths = Array.from(text, (character) => {
            const glyph = font.getGlyph(character);
            const path = `<path d="${glyph.path}" transform="translate(${pen} ${baseline}) scale(${scale})" fill="blue" stroke="blue" stroke-width="${8 / scale}" stroke-linejoin="round"/>`;
            pen += glyph.advanceWidth * scale + spacing;
            return path;
        }).join("");
        const url = URL.createObjectURL(
            new Blob(
                [
                    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128"><g transform="translate(${x} 64) rotate(${angle})">${paths}</g></svg>`,
                ],
                { type: "image/svg+xml" }
            )
        );
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const context = new OffscreenCanvas(
                canvas.width,
                canvas.height
            ).getContext("2d");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    /** @param {Uint8Array} actual @param {Uint8ClampedArray} expected */
    function compareGeometry(actual, expected) {
        let foreground = 0,
            background = 0,
            mismatches = 0;
        // The oracle checks stable geometry outside both rasterizers' AA fringe.
        for (let y = 2; y < canvas.height - 2; y++) {
            for (let x = 2; x < canvas.width - 2; x++) {
                const i = (y * canvas.width + x) * 4 + 3,
                    alpha = expected[i];
                if (alpha !== 0 && alpha !== 255) continue;
                let stable = true;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++)
                        if (
                            expected[i + (dy * canvas.width + dx) * 4] !== alpha
                        )
                            stable = false;
                }
                if (!stable) continue;
                if (alpha === 255) foreground++;
                else background++;
                if (Math.abs(actual[i] - alpha) > 3) mismatches++;
            }
        }
        return { foreground, background, mismatches };
    }
}
