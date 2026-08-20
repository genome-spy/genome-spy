/* global document */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("imported point and linear definitions render and pick a point", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const pickedId = await page.evaluate(async () => {
        const [{ createRenderer }, { pointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/linear.js"),
            ]);

        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 1 });
        const handle = renderer.createMark(pointMark, {
            count: 1,
            channels: {
                uniqueId: { data: new Uint32Array([41]), type: "u32" },
                x: {
                    data: new Float32Array([0.5]),
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                y: {
                    data: new Float32Array([0.5]),
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                size: { value: 400 },
            },
        });

        renderer.render();
        await renderer.device.queue.onSubmittedWorkDone();
        const id = await renderer.pick(32, 32);
        renderer.destroyMark(handle.markId);
        canvas.remove();
        return id;
    });

    expect(pickedId).toBe(41);
});
