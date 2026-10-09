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

// Fractional inputs cross a base-4096 boundary without losing the sub-row part.
test("fractional index picking follows padding, reversal, and zoom", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const results = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark },
            { indexScale },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/scales/index.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 40;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 200, height: 40, dpr: 1 });
        const start = 2 ** 32 + 4096;
        const packed = new Uint32Array([1048577, 0, 0, 0]);
        const results = [];
        for (const [align, band] of [
            [0.5, 0.5],
            [0.25, 0.25],
        ]) {
            for (const range of [
                [10, 190],
                [190, 10],
            ]) {
                for (const fraction of [0, 0.5]) {
                    new Float32Array(packed.buffer)[2] = fraction;
                    const mark = renderer.createMark(pointMark, {
                        count: 1,
                        channels: {
                            uniqueId: { value: 42, type: "u32" },
                            x: {
                                data: packed,
                                type: "u32",
                                inputComponents: 4,
                                scale: indexScale({
                                    domain: [start, start + 3],
                                    range,
                                    paddingInner: 0.3,
                                    paddingOuter: 0.4,
                                    align,
                                    band,
                                }),
                            },
                            y: { value: 20, scale: identityScale() },
                            size: { value: 16, scale: identityScale() },
                        },
                    });
                    // Retain the same series and pipeline while changing the zoom domain.
                    for (const domain of [
                        [start, start + 3],
                        [start + 0.25, start + 1.75],
                    ]) {
                        mark.scales.x.setDomain(domain);
                        renderer.render({ draws: [{ mark }] });
                        await renderer.device.queue.onSubmittedWorkDone();
                        const n = domain[1] - domain[0];
                        const step = (range[1] - range[0]) / (n - 0.3 + 0.8);
                        const reverse = range[1] < range[0];
                        const positiveStep = Math.abs(step);
                        const origin =
                            Math.min(...range) +
                            (Math.abs(range[1] - range[0]) -
                                positiveStep * (n - 0.3)) *
                                align;
                        const position = start + fraction - domain[0];
                        const expected =
                            origin +
                            (reverse ? n - 1 - position : position) *
                                positiveStep +
                            positiveStep * 0.7 * band;
                        results.push(await renderer.pick(expected, 20));
                        results.push(
                            await renderer.pick(expected - step * 0.5, 20)
                        );
                    }
                    renderer.destroyMark(mark.markId);
                }
            }
        }
        renderer.destroy();
        canvas.remove();
        return results;
    });
    expect(results).toEqual(
        Array.from({ length: 16 }, () => [42, null]).flat()
    );
});
