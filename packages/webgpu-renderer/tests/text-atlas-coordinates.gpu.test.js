/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const paint of ["fill", "shadow"]) {
    test(`text centers ${paint} on a straight glyph`, async ({ page }) => {
        await ensureWebGPU(page);
        const { actual, expected } = await page.evaluate(async (paint) => {
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
            const anchor = 64.25;
            canvas.width = canvas.height = width * dpr;
            document.body.appendChild(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width, height: width, dpr });
            const mark = renderer.createMark(textMark, {
                font,
                fontSize: size,
                channels: {
                    text: { value: label },
                    x: { value: anchor, scale: identityScale() },
                    y: { value: anchor, scale: identityScale() },
                    size: { value: size },
                    fill: { value: [0.5, 0.5, 0.5, 1] },
                    strokeWidth: { value: 0 },
                    ...(paint === "shadow"
                        ? {
                              fillOpacity: { value: 0 },
                              shadowOpacity: { value: 1 },
                              shadowColor: { value: [0.5, 0.5, 0.5, 1] },
                          }
                        : {}),
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
            const glyph = font.getGlyph(label);
            const { xMin, xMax, yMin, yMax } = glyph.bounds;
            const scale = (size * dpr) / font.unitsPerEm;
            const x =
                anchor * dpr + ((xMin + xMax - glyph.advanceWidth) / 2) * scale;
            const y =
                anchor * dpr + ((font.capHeight - yMin - yMax) / 2) * scale;

            // Use the alpha-weighted center of a scanline through the solid stem.
            function measure(data) {
                let extent = 0;
                let moment = 0;
                for (let pixel = 0; pixel < data.length / 4; pixel++) {
                    const alpha = data[4 * pixel + 3] / 255;
                    extent += alpha;
                    moment += (pixel + 0.5) * alpha;
                }
                return { extent, center: moment / extent };
            }
            const row = measure(
                context.getImageData(0, Math.floor(y), canvas.width, 1).data
            );
            const column = measure(
                context.getImageData(Math.floor(x), 0, 1, canvas.height).data
            );
            bitmap.close();
            renderer.destroy();
            canvas.remove();
            return {
                actual: { x: row.center, y: column.center, width: row.extent },
                expected: { x, y, width: (xMax - xMin) * scale },
            };
        }, paint);

        for (const axis of ["x", "y", "width"]) {
            expect(
                Math.abs(actual[axis] - expected[axis]),
                JSON.stringify({ axis, actual, expected })
            ).toBeLessThan(0.1);
        }
    });
}
