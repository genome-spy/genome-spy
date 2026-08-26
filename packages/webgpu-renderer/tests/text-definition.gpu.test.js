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
