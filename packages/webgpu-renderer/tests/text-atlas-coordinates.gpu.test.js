/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("text preserves the width of a straight glyph stem", async ({ page }) => {
    await ensureWebGPU(page);
    const { actual, expected } = await page.evaluate(async () => {
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
        const response = await fetch("/src/fonts/DefaultFont.ttf");
        const font = createTrueTypeFont(await response.arrayBuffer());
        const canvas = document.createElement("canvas");
        const width = 128;
        const dpr = 2;
        const size = 80;
        const label = "|";
        canvas.width = canvas.height = width * dpr;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width, height: width, dpr });
        const mark = renderer.createMark(textMark, {
            font,
            fontSize: size,
            channels: {
                text: { value: label },
                x: { value: 64.25, scale: identityScale() },
                y: { value: 64.25, scale: identityScale() },
                size: { value: size },
                fill: { value: [0.5, 0.5, 0.5, 1] },
                strokeWidth: { value: 0 },
            },
        });
        renderer.render({
            draws: [{ mark }],
            clearColor: { r: 0, g: 0, b: 0, a: 0 },
        });
        await renderer.device.queue.onSubmittedWorkDone();
        const png = await fetch(canvas.toDataURL("image/png"));
        const bitmap = await createImageBitmap(await png.blob());
        const context = new OffscreenCanvas(
            canvas.width,
            canvas.height
        ).getContext("2d");
        context.drawImage(bitmap, 0, 0);
        const row = context.getImageData(
            0,
            canvas.height / 2,
            canvas.width,
            1
        ).data;
        // Sum coverage across a straight section to measure the subpixel width.
        let actual = 0;
        for (let index = 3; index < row.length; index += 4) {
            actual += row[index] / 255;
        }
        const { xMin, xMax } = font.getGlyph(label).bounds;
        bitmap.close();
        renderer.destroy();
        canvas.remove();
        return {
            actual,
            expected: ((xMax - xMin) * size * dpr) / font.unitsPerEm,
        };
    });

    expect(
        Math.abs(actual - expected),
        JSON.stringify({ actual, expected })
    ).toBeLessThan(0.1);
});
