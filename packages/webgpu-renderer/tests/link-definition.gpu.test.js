/* global document */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("segmented links use their full geometry for picking", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const pickedIds = await page.evaluate(async () => {
        const [{ createRenderer }, { linkMark }] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/link.js"),
        ]);

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const mark = renderer.createMark(linkMark, {
            count: 1,
            channels: {
                uniqueId: { value: 17, type: "u32" },
                x: { value: 8 },
                x2: { value: 56 },
                y: { value: 48 },
                y2: { value: 48 },
                size: { value: 4 },
            },
            linkShape: "arc",
            segments: 20,
        });

        renderer.render({ draws: [{ mark }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const ids = [await renderer.pick(32, 24), await renderer.pick(32, 32)];
        renderer.destroy();
        canvas.remove();
        return ids;
    });

    expect(pickedIds).toEqual([17, null]);
});
