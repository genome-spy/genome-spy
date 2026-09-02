/* global document */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("text mark indexes logical series from glyph instances", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { textMark },
            { linearScale },
            { default: getMetrics },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/text.js"),
            import("/src/scales/linear.js"),
            import("/src/fonts/bmFontMetrics.js"),
        ]);
        const fontJson = await fetch("/src/fonts/Lato-Regular.json").then(
            (response) => response.json()
        );
        const bitmap = await createImageBitmap(
            new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1)
        );

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        renderer.device.pushErrorScope("validation");
        const mark = renderer.createMark(textMark, {
            count: 2,
            fontResource: { metrics: getMetrics(fontJson), bitmap },
            channels: {
                uniqueId: {
                    data: new Uint32Array([41, 42]),
                    type: "u32",
                },
                text: { data: ["AA", "B"] },
                x: {
                    data: new Float32Array([0.25, 0.75]),
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                y: {
                    value: 0.5,
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
            },
        });

        renderer.render({ draws: [{ mark }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const before = [
            await renderer.pick(16, 32),
            await renderer.pick(48, 32),
        ];
        mark.series.replace({
            uniqueId: new Uint32Array([43, 44]),
            text: ["C", "DDD"],
            x: new Float32Array([0.25, 0.75]),
        });
        renderer.render({ draws: [{ mark }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const after = [
            await renderer.pick(16, 32),
            await renderer.pick(48, 32),
        ];
        const error = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return { validationError: error?.message ?? null, before, after };
    });

    expect(result.validationError).toBeNull();
    expect(result.before).toHaveLength(2);
    expect(result.after).toHaveLength(2);
});

test("text mark renders supersampled RGBA16F TrueType outlines", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
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
        const bytes = await fetch("/src/fonts/DefaultFont.ttf").then(
            (response) => response.arrayBuffer()
        );
        const font = createTrueTypeFont(bytes);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        renderer.device.pushErrorScope("validation");
        const mark = renderer.createMark(textMark, {
            count: 1,
            font,
            fontSize: 32,
            channels: {
                uniqueId: { value: 71, type: "u32" },
                text: { value: "AV" },
                x: { value: 32, scale: identityScale() },
                y: { value: 32, scale: identityScale() },
                size: { value: 32 },
                fill: { value: [0.2, 0.5, 0.9, 1] },
                stroke: { value: [0, 0, 0, 1] },
                strokeWidth: { value: 1.5 },
            },
        });
        renderer.render({ draws: [{ mark }] });
        await renderer.device.queue.onSubmittedWorkDone();
        let hit = null;
        for (let y = 16; y <= 48 && hit === null; y += 4) {
            for (let x = 8; x <= 56 && hit === null; x += 4) {
                hit = await renderer.pick(x, y);
            }
        }
        const program = renderer._marks.get(mark.markId);
        const atlas = program._extraTextures.get("fontAtlas");
        const validationError = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return {
            hit,
            atlasFormat: atlas.format,
            validationError: validationError?.message ?? null,
        };
    });

    expect(result).toEqual({
        hit: 71,
        atlasFormat: "rgba16float",
        validationError: null,
    });
});

test("outline text ignores stroke color when stroke width is zero", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
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
        const bytes = await fetch("/src/fonts/DefaultFont.ttf").then(
            (response) => response.arrayBuffer()
        );
        const font = createTrueTypeFont(bytes);

        /** @param {number[]} stroke */
        const render = async (stroke) => {
            const dpr = 2;
            const canvas = document.createElement("canvas");
            canvas.width = 96 * dpr;
            canvas.height = 64 * dpr;
            document.body.appendChild(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width: 96, height: 64, dpr });
            const mark = renderer.createMark(textMark, {
                font,
                fontSize: 40,
                channels: {
                    text: { value: "M+" },
                    x: { value: 48, scale: identityScale() },
                    y: { value: 32, scale: identityScale() },
                    size: { value: 40 },
                    fill: { value: [0.1, 0.4, 0.9, 1] },
                    stroke: { value: stroke },
                    strokeWidth: { value: 0 },
                },
            });
            renderer.render({ draws: [{ mark }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const bitmap = await createImageBitmap(
                await (await fetch(canvas.toDataURL("image/png"))).blob()
            );
            const copy = new OffscreenCanvas(canvas.width, canvas.height);
            const context = copy.getContext("2d");
            context.drawImage(bitmap, 0, 0);
            const pixels = Array.from(
                context.getImageData(0, 0, canvas.width, canvas.height).data
            );
            bitmap.close();
            renderer.destroy();
            canvas.remove();
            return pixels;
        };

        const redStroke = await render([1, 0, 0, 1]);
        const greenStroke = await render([0, 1, 0, 1]);
        let maximumDifference = 0;
        for (let index = 0; index < redStroke.length; index++) {
            maximumDifference = Math.max(
                maximumDifference,
                Math.abs(redStroke[index] - greenStroke[index])
            );
        }
        return { maximumDifference };
    });

    expect(result.maximumDifference).toBe(0);
});

test("TrueType atlases grow across marks and accept new replacement glyphs", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
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
        const bytes = await fetch("/src/fonts/DefaultFont.ttf").then(
            (response) => response.arrayBuffer()
        );
        const font = createTrueTypeFont(bytes);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 128;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 128, height: 64, dpr: 2 });
        renderer.device.pushErrorScope("validation");
        const first = renderer.createMark(textMark, {
            font,
            fontSize: 32,
            channels: {
                uniqueId: { value: 81, type: "u32" },
                text: { value: "A" },
                x: { value: 24, scale: identityScale() },
                y: { value: 32, scale: identityScale() },
                size: { value: 32 },
            },
        });
        const firstProgram = renderer._marks.get(first.markId);
        const atlas = firstProgram._outlineAtlas;
        const initialVersion = atlas.version;
        const initialTexture = atlas.texture;
        const aPath = font.getGlyph("A").path;
        const initialEntry = { ...atlas.ensure([aPath])[0] };

        const ascii = Array.from({ length: 95 }, (_, index) =>
            String.fromCodePoint(index + 32)
        ).join("");
        const second = renderer.createMark(textMark, {
            font,
            fontSize: 20,
            channels: {
                text: { value: ascii },
                x: { value: 64, scale: identityScale() },
                y: { value: 16, scale: identityScale() },
                size: { value: 20 },
            },
        });
        const secondProgram = renderer._marks.get(second.markId);
        const preservedEntry = atlas.ensure([aPath])[0];
        const firstBoundAtlas =
            firstProgram._extraTextures.get("fontAtlas").texture;
        const atlasScaleEntry =
            secondProgram._uniformBufferState.entries.get("uAtlasScale");
        const secondAtlasScale = Array.from(
            new Float32Array(
                secondProgram._uniformBufferState.data,
                atlasScaleEntry.offset,
                2
            )
        );

        renderer.render({ draws: [{ mark: first }] });
        await renderer.device.queue.onSubmittedWorkDone();
        let preservedHit = null;
        for (let y = 16; y <= 48 && preservedHit === null; y += 2) {
            for (let x = 8; x <= 48 && preservedHit === null; x += 2) {
                preservedHit = await renderer.pick(x, y);
            }
        }

        first.series.replace({ text: "Ω−" }, 1);
        renderer.render({ draws: [{ mark: first }] });
        await renderer.device.queue.onSubmittedWorkDone();
        let hit = null;
        for (let y = 16; y <= 48 && hit === null; y += 2) {
            for (let x = 8; x <= 48 && hit === null; x += 2) {
                hit = await renderer.pick(x, y);
            }
        }
        const validationError = await renderer.device.popErrorScope();
        const value = {
            sharedAtlas: secondProgram._outlineAtlas === atlas,
            grew: atlas.version > initialVersion,
            replacedTexture: atlas.texture !== initialTexture,
            reboundFirstMark: firstBoundAtlas === atlas.texture,
            secondAtlasScale,
            atlasDimensions: [atlas.width, atlas.height],
            preservedEntry:
                JSON.stringify(preservedEntry) === JSON.stringify(initialEntry),
            preservedHit,
            hit,
            validationError: validationError?.message ?? null,
        };
        renderer.destroy();
        canvas.remove();
        return value;
    });

    expect(result).toMatchObject({
        sharedAtlas: true,
        grew: true,
        replacedTexture: true,
        reboundFirstMark: true,
        preservedEntry: true,
        preservedHit: 81,
        hit: 81,
        validationError: null,
    });
    expect(result.secondAtlasScale[0]).toBeCloseTo(
        1 / result.atlasDimensions[0]
    );
    expect(result.secondAtlasScale[1]).toBeCloseTo(
        1 / result.atlasDimensions[1]
    );
});
