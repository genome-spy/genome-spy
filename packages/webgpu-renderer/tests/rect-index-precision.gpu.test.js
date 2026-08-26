/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("rects preserve adjacent large index endpoints", async ({ page }) => {
    await ensureWebGPU(page);

    const picked = await page.evaluate(async () => {
        const [
            { createRenderer },
            { rectMark },
            { indexScale },
            { linearScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/index.js"),
            import("/src/scales/linear.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 960, height: 64, dpr: 2 });
        const uniqueId = new Uint32Array(358);
        const x = new Uint32Array(358);
        const x2 = new Uint32Array(358);
        // Exercise nonzero firstInstance plus an endpoint far outside the view.
        uniqueId[356] = 42;
        uniqueId[357] = 43;
        x[356] = 2_400_000_000;
        x[357] = 2_470_387_217;
        x2[356] = 2_470_387_217;
        x2[357] = 2_470_387_224;
        const mark = renderer.createMark(rectMark, {
            count: 358,
            channels: {
                uniqueId: {
                    data: uniqueId,
                    type: "u32",
                },
                x: {
                    data: x,
                    type: "u32",
                    scale: indexScale({
                        domain: [2_470_387_120, 2_470_387_355],
                        range: [0, 960],
                        band: 0,
                    }),
                },
                x2: {
                    data: x2,
                    type: "u32",
                    scale: indexScale({
                        domain: [2_470_387_120, 2_470_387_355],
                        range: [0, 960],
                        band: 0,
                    }),
                },
                y: {
                    value: 10,
                    scale: linearScale({ domain: [0, 64], range: [64, 0] }),
                },
                y2: {
                    value: 20,
                    scale: linearScale({ domain: [0, 64], range: [64, 0] }),
                },
            },
        });
        renderer.render({
            draws: [{ mark, firstInstance: 356, instanceCount: 2 }],
        });
        await renderer.device.queue.onSubmittedWorkDone();
        const result = [
            await renderer.pick(390, 54),
            await renderer.pick(405, 54),
        ];
        renderer.destroy();
        canvas.remove();
        return result;
    });

    expect(picked).toEqual([42, 43]);
});
