/* global document */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("rect clamping preserves full strokes, clamps axes independently, and hides collapsed bounds", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const picked = await page.evaluate(async () => {
        const [{ createRenderer }, { rectMark }, { identityScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/rect.js"),
                import("/src/scales/identity.js"),
            ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 100, height: 100, dpr: 1 });
        const results = [];

        for (const clamp of ["none", "x", "y", "both"]) {
            const mark = renderer.createMark(rectMark, {
                count: 3,
                channels: {
                    uniqueId: { data: new Uint32Array([1, 2, 3]), type: "u32" },
                    // Reversed endpoints, one outside rect, and one touching
                    // the boundary. Minimum sizes must not resurrect the latter.
                    x: {
                        data: new Float32Array([90, 5, 20]),
                        scale: identityScale(),
                    },
                    x2: {
                        data: new Float32Array([10, 15, 10]),
                        scale: identityScale(),
                    },
                    y: {
                        data: new Float32Array([90, 40, 60]),
                        scale: identityScale(),
                    },
                    y2: {
                        data: new Float32Array([10, 60, 80]),
                        scale: identityScale(),
                    },
                    ...(clamp === "x" || clamp === "both"
                        ? { xClampRange: { value: [20, 80], dynamic: true } }
                        : {}),
                    ...(clamp === "y" || clamp === "both"
                        ? { yClampRange: { value: [20, 80], dynamic: true } }
                        : {}),
                    fillOpacity: { value: 0 },
                    strokeOpacity: { value: 1 },
                    strokeWidth: { value: 4 },
                    minWidth: { value: 20 },
                    minHeight: { value: 20 },
                    minOpacity: { value: 1 },
                },
            });
            renderer.render({ draws: [{ mark }] });
            await renderer.device.queue.onSubmittedWorkDone();
            results.push(
                await Promise.all([
                    renderer.pick(18, 30), // Full left stroke outside the clamp bound.
                    renderer.pick(30, 18), // Full top stroke outside the clamp bound.
                    renderer.pick(10, 40), // Outside group, expanded by minWidth.
                    renderer.pick(10, 60), // Group touching the x clamp boundary.
                ])
            );
            if (clamp === "both") {
                mark.values.xClampRange.set([30, 70]);
                mark.values.yClampRange.set([30, 70]);
                renderer.render({ draws: [{ mark }] });
                results.push(
                    await Promise.all([
                        renderer.pick(28, 50),
                        renderer.pick(50, 28),
                        renderer.pick(18, 30),
                    ])
                );
            }
            renderer.destroyMark(mark.markId);
        }
        renderer.destroy();
        canvas.remove();
        return results;
    });

    expect(picked).toEqual([
        [null, null, 2, 3],
        [1, null, null, null],
        [null, 1, 2, 3],
        [1, 1, null, null],
        [1, 1, null],
    ]);
});
