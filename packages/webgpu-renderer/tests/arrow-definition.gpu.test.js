/* global document */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("arrow mark shader renders a retained arrow", async ({ page }) => {
    await ensureWebGPU(page);

    const rendered = await page.evaluate(async () => {
        const [{ createRenderer }, { arrowMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/arrow.js"),
                import("/src/scales/linear.js"),
            ]);

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const mark = renderer.createMark(arrowMark, {
            count: 1,
            channels: {
                x: {
                    value: 8,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                x2: {
                    value: 56,
                    scale: linearScale({ domain: [0, 64], range: [0, 64] }),
                },
                y: { value: 32 },
                y2: { value: 32 },
                fill: { value: [0.2, 0.4, 0.8, 1] },
                stroke: { value: [0, 0, 0, 1] },
                size: { value: 6 },
                direction: { value: 0, type: "u32" },
            },
            headAngle: 1,
            headNotchAngle: 0,
            headShape: 0,
            headPlacement: 0,
            minSize: 1,
            headWidth: 3,
            stem: 1,
            headSpacing: -1,
        });

        renderer.render({ draws: [{ mark }] });
        await renderer.device.queue.onSubmittedWorkDone();
        renderer.destroy();
        canvas.remove();
        return true;
    });

    expect(rendered).toBe(true);
});
