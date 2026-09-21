/* global document */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`arrow geometry and picking agree at DPR ${dpr}`, async ({ page }) => {
        await ensureWebGPU(page);

        const pickedIds = await page.evaluate(async (dpr) => {
            const [
                { createRenderer },
                { ARROW_DIRECTIONS, arrowMark },
                { linearScale },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/arrow.js"),
                import("/src/scales/linear.js"),
            ]);

            const canvas = document.createElement("canvas");
            canvas.width = 128 * dpr;
            canvas.height = 128 * dpr;
            document.body.appendChild(canvas);

            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width: 128, height: 128, dpr });
            const xScale = linearScale({
                domain: [0, 128],
                range: [0, 128],
            });

            const createArrow = ({
                uniqueId,
                x,
                x2,
                y,
                direction,
                stem = true,
                headPlacement = "outside",
                minStemLength = 0,
            }) =>
                renderer.createMark(arrowMark, {
                    count: 1,
                    channels: {
                        uniqueId: { value: uniqueId, type: "u32" },
                        x: { value: x, scale: xScale },
                        x2: { value: x2, scale: xScale },
                        y: { value: y },
                        y2: { value: y },
                        fill: { value: [0.2, 0.4, 0.8, 1] },
                        stroke: { value: [0, 0, 0, 1] },
                        size: { value: 8 },
                        direction: { value: direction, type: "u32" },
                    },
                    headAngle: 45,
                    headNotchAngle: 90,
                    headShape: "triangle",
                    headPlacement,
                    minSize: 1,
                    minStemLength,
                    headWidth: 3,
                    startNotch: true,
                    stem,
                    headSpacing: 3,
                });

            const bidirectional = createArrow({
                uniqueId: 41,
                x: 20,
                x2: 108,
                y: 20,
                direction: ARROW_DIRECTIONS.both,
            });
            const headsOnly = createArrow({
                uniqueId: 42,
                x: 20,
                x2: 108,
                y: 48,
                direction: ARROW_DIRECTIONS.both,
                stem: false,
            });
            const reverseOutside = createArrow({
                uniqueId: 43,
                x: 20,
                x2: 108,
                y: 76,
                direction: ARROW_DIRECTIONS.reverse,
                stem: false,
            });
            const shortInside = createArrow({
                uniqueId: 44,
                x: 54,
                x2: 74,
                y: 108,
                direction: ARROW_DIRECTIONS.both,
                headPlacement: "inside",
                minStemLength: 16,
            });

            renderer.render({
                draws: [
                    { mark: bidirectional },
                    { mark: headsOnly },
                    { mark: reverseOutside },
                    { mark: shortInside },
                ],
            });
            await renderer.device.queue.onSubmittedWorkDone();

            const points = [
                [12, 20],
                [64, 20],
                [116, 20],
                [12, 10],
                [12, 48],
                [64, 48],
                [116, 48],
                [12, 76],
                [104, 76],
                [56, 108],
                [64, 108],
                [72, 108],
            ];
            const ids = [];
            for (const [x, y] of points) {
                ids.push(await renderer.pick(x, y));
            }

            renderer.destroy();
            canvas.remove();
            return ids;
        }, dpr);

        expect(pickedIds).toEqual([
            41,
            41,
            41,
            null,
            42,
            null,
            42,
            43,
            null,
            44,
            44,
            44,
        ]);
    });
}
