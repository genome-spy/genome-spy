/* global document */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("placed rules preserve their pixel stroke width", async ({ page }) => {
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [{ createRenderer }, { ruleMark }] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rule.js"),
        ]);

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0.25, 1, 0.25]),
        });
        const mark = renderer.createMark(ruleMark, {
            count: 1,
            channels: {
                uniqueId: { value: 17, type: "u32" },
                x: { value: 8 },
                x2: { value: 56 },
                y: { value: 32 },
                y2: { value: 32 },
                size: { value: 8 },
            },
            placementIndex: { source: "draw" },
        });

        renderer.render({
            draws: [
                {
                    mark,
                    placement: { set: placements, index: 0 },
                },
            ],
        });
        await renderer.device.queue.onSubmittedWorkDone();
        const ids = [await renderer.pick(32, 27), await renderer.pick(32, 29)];
        renderer.destroy();
        canvas.remove();
        return {
            ids,
            maxStorageBuffersPerShaderStage:
                renderer.device.limits.maxStorageBuffersPerShaderStage,
        };
    });

    expect(result).toEqual({
        ids: [17, null],
        maxStorageBuffersPerShaderStage: 8,
    });
});
