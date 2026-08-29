/* global document, window */

import { expect, test } from "@playwright/test";
import { scaleLinear } from "d3-scale";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("retained scale updates keep rendered WGSL mapping aligned with d3", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const value = 0.75;
    const initialX = scaleLinear().domain([0, 1]).range([0, 64])(value);
    const updatedX = scaleLinear().domain([0, 3]).range([0, 32])(value);
    const picks = await page.evaluate(
        async ({ value, initialX, updatedX }) => {
            const [{ createRenderer }, { pointMark }, { linearScale }] =
                await Promise.all([
                    import("/src/index.js"),
                    import("/src/marks/point.js"),
                    import("/src/scales/linear.js"),
                ]);

            const canvas = document.createElement("canvas");
            canvas.width = 128;
            canvas.height = 128;
            document.body.appendChild(canvas);

            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
            const handle = renderer.createMark(pointMark, {
                count: 1,
                channels: {
                    uniqueId: { data: new Uint32Array([41]), type: "u32" },
                    x: {
                        data: new Float32Array([value]),
                        type: "f32",
                        scale: linearScale({
                            domain: [0, 1],
                            range: [0, 64],
                        }),
                    },
                    y: {
                        value: 0.5,
                        scale: linearScale({
                            domain: [0, 1],
                            range: [0, 64],
                        }),
                    },
                    size: { value: 16 },
                },
            });

            renderer.render({ draws: [{ mark: handle }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const before = await renderer.pick(initialX, 32);

            handle.scales.x.setDomain([0, 3]);
            handle.scales.x.setRange([0, 32]);
            renderer.render({ draws: [{ mark: handle }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const stale = await renderer.pick(initialX, 32);
            const updated = await renderer.pick(updatedX, 32);

            renderer.destroy();
            canvas.remove();
            return { before, stale, updated };
        },
        { value, initialX, updatedX }
    );

    expect(picks).toEqual({ before: 41, stale: null, updated: 41 });
});

test("one retained point mark renders into two draw occurrences", async ({
    page,
}) => {
    await ensureWebGPU(page);

    const pickedIds = await page.evaluate(async () => {
        const [{ createRenderer }, { pointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/linear.js"),
            ]);

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const handle = renderer.createMark(pointMark, {
            count: 2,
            channels: {
                uniqueId: {
                    data: new Uint32Array([41, 42]),
                    type: "u32",
                },
                x: {
                    data: new Float32Array([0.5, 0.5]),
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 32] }),
                },
                y: {
                    data: new Float32Array([0.5, 0.5]),
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                size: { value: 400 },
            },
        });

        renderer.render({
            draws: [
                {
                    mark: handle,
                    viewport: { x: 0, y: 0, width: 32, height: 64 },
                    scissor: { x: 0, y: 0, width: 32, height: 64 },
                    firstInstance: 0,
                    instanceCount: 1,
                },
                {
                    mark: handle,
                    viewport: { x: 32, y: 0, width: 32, height: 64 },
                    scissor: { x: 32, y: 0, width: 32, height: 64 },
                    firstInstance: 1,
                    instanceCount: 1,
                },
            ],
        });
        await renderer.device.queue.onSubmittedWorkDone();
        const ids = [await renderer.pick(16, 32), await renderer.pick(48, 32)];
        renderer.destroy();
        canvas.remove();
        return ids;
    });

    expect(pickedIds).toEqual([41, 42]);
});

test("visibility predicates cull point instances from rendering and picking", async ({
    page,
}) => {
    await ensureWebGPU(page);

    await page.evaluate(async () => {
        const [{ createRenderer }, { pointMark }, { linearScale }] =
            await Promise.all([
                import("/src/index.js"),
                import("/src/marks/point.js"),
                import("/src/scales/linear.js"),
            ]);

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        canvas.dataset.test = "visibility-point";
        document.body.appendChild(canvas);

        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 64, height: 64, dpr: 2 });
        const handle = renderer.createMark(pointMark, {
            count: 2,
            channels: {
                uniqueId: {
                    data: new Uint32Array([41, 42]),
                    type: "u32",
                },
                x: {
                    data: new Float32Array([0.25, 0.75]),
                    type: "f32",
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                y: {
                    value: 0.5,
                    scale: linearScale({ domain: [0, 1], range: [0, 64] }),
                },
                size: { value: 400 },
            },
            inputs: {
                score: { data: new Float32Array([0.25, 0.75]), type: "f32" },
            },
            scalarSlots: {
                threshold: { value: 0.5, type: "f32" },
            },
            visibleWhen: {
                compare: ">=",
                left: { input: "score" },
                right: { slot: "threshold" },
            },
        });

        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        window.__visibilityPointRenderer = renderer;
        window.__visibilityPointHandle = handle;
    });

    const visibleFramebuffer = await page
        .locator('canvas[data-test="visibility-point"]')
        .screenshot();
    const pickedIds = await page.evaluate(async () => {
        const renderer = window.__visibilityPointRenderer;
        const handle = window.__visibilityPointHandle;
        const ids = [await renderer.pick(16, 32), await renderer.pick(48, 32)];
        handle.scalarSlots.threshold.set(Infinity);
        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const afterInfinity = [
            await renderer.pick(16, 32),
            await renderer.pick(48, 32),
        ];
        return { ids, afterInfinity };
    });
    const hiddenFramebuffer = await page
        .locator('canvas[data-test="visibility-point"]')
        .screenshot();
    await page.evaluate(() => {
        window.__visibilityPointRenderer.destroy();
        document.querySelector('canvas[data-test="visibility-point"]').remove();
    });

    expect(pickedIds).toEqual({
        ids: [null, 42],
        afterInfinity: [null, null],
    });
    expect(visibleFramebuffer).not.toEqual(hiddenFramebuffer);
});
