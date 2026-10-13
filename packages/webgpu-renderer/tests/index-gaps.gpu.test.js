/* global document */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";
import { runScaleCase } from "./scaleShaderTestUtils.js";
import {
    packHighPrecisionU32Array,
    packHighPrecisionDomain,
} from "../src/utils/highPrecision.js";
import { indexScale } from "../src/scales/index.js";

for (const base of [0, 2 ** 35]) {
    test(`index gap rank lookup preserves endpoint precision at ${base}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const inputs = [base + 9, base + 10, base + 11];
        const domain = [base, base + 20];
        const cuts = [base + 10];
        for (const reverse of [false, true]) {
            for (const before of [false, true]) {
                const range = reverse ? [100, 0] : [0, 100];
                const output = await runScaleCase(page, {
                    channels: {
                        x: {
                            data: base
                                ? packHighPrecisionU32Array(inputs)
                                : new Uint32Array(inputs),
                            type: "u32",
                            inputComponents: base ? 2 : 1,
                            components: 1,
                            scale: indexScale({
                                domain,
                                range,
                                gapPositions: cuts,
                                gapWidth: 6,
                                gapBefore: before,
                                band: 0,
                            }),
                        },
                    },
                    channelName: "x",
                    outputType: "f32",
                    outputLength: inputs.length,
                    outputComponents: 1,
                    uniformLayout: [
                        {
                            name: "uDomain_x",
                            type: "f32",
                            components: 1,
                            arrayLength: 3,
                        },
                        {
                            name: "uRange_x",
                            type: "f32",
                            components: 1,
                            arrayLength: 2,
                        },
                        ...[
                            "PaddingInner",
                            "PaddingOuter",
                            "Align",
                            "Band",
                        ].map((key) => ({
                            name: "uScale" + key + "_x",
                            type: "f32",
                            components: 1,
                        })),
                        { name: "gapTable_x", type: "u32", components: 2 },
                        { name: "gapGeometry_x", type: "f32", components: 4 },
                    ],
                    uniforms: {
                        uDomain_x: packHighPrecisionDomain(...domain),
                        uRange_x: range,
                        uScalePaddingInner_x: 0,
                        uScalePaddingOuter_x: 0,
                        uScaleAlign_x: 0.5,
                        uScaleBand_x: 0,
                        gapTable_x: [0, 1],
                        gapGeometry_x: [6, 0, 1, 0],
                    },
                    extraBuffers: [
                        {
                            name: "__gapCuts",
                            role: "gapCuts",
                            data: new Uint32Array([
                                Math.floor(cuts[0] / 4096),
                                cuts[0] % 4096,
                            ]),
                        },
                    ],
                });
                const expected = [42.3, before ? 47 : 53, 57.7];
                output.forEach((value, i) =>
                    expect(value).toBeCloseTo(
                        reverse ? 100 - expected[i] : expected[i],
                        4
                    )
                );
            }
        }
    });
}

test("retained cut updates preserve gap picking and reuse buffers on domain changes", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { rectMark },
            { indexScale },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/index.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 50;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 100, height: 50, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const handle = renderer.createMark(rectMark, {
            count: 2,
            channels: {
                uniqueId: { data: new Uint32Array([1, 2]), type: "u32" },
                x: {
                    data: new Uint32Array([0, 10]),
                    type: "u32",
                    scale: indexScale({
                        domain: [0, 20],
                        range: [0, 100],
                        band: 0,
                        gapPositions: [10],
                        gapWidth: 6,
                        gapPeer: "x2",
                    }),
                },
                x2: {
                    data: new Uint32Array([10, 20]),
                    type: "u32",
                    scale: indexScale({
                        domain: [0, 20],
                        range: [0, 100],
                        band: 0,
                        gapPositions: [10],
                        gapWidth: 6,
                        gapPeer: "x",
                    }),
                },
                y: { value: 5, scale: identityScale() },
                y2: { value: 45, scale: identityScale() },
                fill: { value: [0, 0, 1, 1] },
                strokeOpacity: { value: 0 },
            },
        });
        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const initial = await Promise.all([
            renderer.pick(45, 25),
            renderer.pick(50, 25),
            renderer.pick(55, 25),
        ]);
        const program = renderer._marks.get(handle.markId);
        const buffer =
            program._scaleResources.getChannelResources("__gapCuts").gapCuts
                .buffer;
        for (const name of ["x", "x2"]) {
            handle.scales[name].setDomain([5, 15]);
        }
        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const zoomed = await Promise.all([
            renderer.pick(45, 25),
            renderer.pick(50, 25),
            renderer.pick(55, 25),
        ]);
        const sameBuffer =
            buffer ===
            program._scaleResources.getChannelResources("__gapCuts").gapCuts
                .buffer;
        for (const name of ["x", "x2"]) handle.scales[name].setGapWidth(0);
        renderer.render({ draws: [{ mark: handle }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const closed = await renderer.pick(50, 25);
        const error = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return { initial, zoomed, closed, sameBuffer, error: error?.message };
    });
    expect(result.initial).toEqual([1, null, 2]);
    expect(result.zoomed).toEqual([1, null, 2]);
    expect(result.closed).toBe(2);
    expect(result.sameBuffer).toBe(true);
    expect(result.error).toBeUndefined();
});

test("unequal placements keep the same logical-pixel gaps", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { rectMark },
            { indexScale },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/index.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 200, height: 100, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0, 0.5, 0.5, 0.5, 0.5, 0.25, 0.5]),
        });
        const handle = renderer.createMark(rectMark, {
            count: 2,
            placementIndex: { source: "draw" },
            channels: {
                uniqueId: { data: new Uint32Array([1, 2]), type: "u32" },
                x: {
                    data: new Uint32Array([0, 10]),
                    type: "u32",
                    scale: indexScale({
                        domain: [0, 20],
                        range: [0, 200],
                        band: 0,
                        gapPositions: [10],
                        gapWidth: 6,
                        gapPeer: "x2",
                    }),
                },
                x2: {
                    data: new Uint32Array([10, 20]),
                    type: "u32",
                    scale: indexScale({
                        domain: [0, 20],
                        range: [0, 200],
                        band: 0,
                        gapPositions: [10],
                        gapWidth: 6,
                        gapPeer: "x",
                    }),
                },
                y: { value: 0, scale: identityScale() },
                y2: { value: 100, scale: identityScale() },
                fill: { value: [0, 0, 1, 1] },
                strokeOpacity: { value: 0 },
            },
        });
        renderer.render({
            draws: [0, 1].map((index) => ({
                mark: handle,
                placement: { set: placements, index, clipToPlacement: "xy" },
            })),
        });
        await renderer.device.queue.onSubmittedWorkDone();
        const picks = await Promise.all(
            [
                [46, 25],
                [48, 25],
                [52, 25],
                [54, 25],
                [121, 75],
                [123, 75],
                [127, 75],
                [129, 75],
            ].map(([x, y]) => renderer.pick(x, y))
        );
        const error = await renderer.device.popErrorScope();
        placements.destroy();
        renderer.destroy();
        canvas.remove();
        return { picks, error: error?.message };
    });
    expect(result.picks).toEqual([1, null, null, 2, 1, null, null, 2]);
    expect(result.error).toBeUndefined();
});

test("exhausted per-instance placements hide clamped marks and recover", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { rectMark },
            { indexScale },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/index.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 100;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 100, height: 100, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0, 1, 0.45, 0, 0.5, 1, 0.45]),
        });
        const scale = indexScale({
            domain: [0, 20],
            range: [0, 100],
            gapPositions: [10],
            gapWidth: 6,
            band: 0,
        });
        const handle = renderer.createMark(rectMark, {
            count: 2,
            placementIndex: { data: new Uint32Array([0, 1]), type: "u32" },
            channels: {
                uniqueId: { data: new Uint32Array([1, 2]), type: "u32" },
                x: { value: 0, type: "u32", scale },
                x2: { value: 20, type: "u32", scale },
                xClampRange: { value: [0, 100] },
                y: { value: 0, scale: identityScale() },
                y2: { value: 100, scale: identityScale() },
                fill: { value: [0, 0, 1, 1] },
                strokeOpacity: { value: 0 },
            },
        });
        const picks = [];
        for (const width of [1, 0.06, 0.04, 1]) {
            placements.replace({
                rectangles: new Float32Array([
                    0,
                    0,
                    width,
                    0.45,
                    0,
                    0.5,
                    1,
                    0.45,
                ]),
            });
            renderer.render({
                draws: [{ mark: handle, placement: { set: placements } }],
            });
            await renderer.device.queue.onSubmittedWorkDone();
            picks.push(await renderer.pick(2, 20), await renderer.pick(50, 75));
        }
        const error = await renderer.device.popErrorScope();
        placements.destroy();
        renderer.destroy();
        canvas.remove();
        return { picks, error: error?.message };
    });
    expect(result.picks).toEqual([1, 2, null, 2, null, 2, 1, 2]);
    expect(result.error).toBeUndefined();
});

test("conditional endpoints retain partial edge gaps across domain updates", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { rectMark },
            { indexScale },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/index.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 50;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 100, height: 50, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const scale = (/** @type {string} */ peer) =>
            indexScale({
                domain: [10, 30],
                range: [0, 100],
                gapPositions: [10],
                gapWidth: 6,
                gapDomain: [0.5, 1],
                gapPeer: peer,
                band: 0,
            });
        const handle = renderer.createMark(rectMark, {
            count: 1,
            channels: {
                uniqueId: { value: 1, type: "u32" },
                x: {
                    value: 0,
                    scale: identityScale(),
                    conditions: [
                        {
                            when: {
                                selection: "picked",
                                type: "single",
                                empty: true,
                            },
                            channel: {
                                value: 10,
                                type: "u32",
                                scale: scale("x2"),
                            },
                        },
                    ],
                },
                x2: { value: 20, type: "u32", scale: scale("x") },
                y: { value: 0, scale: identityScale() },
                y2: { value: 50, scale: identityScale() },
                fill: { value: [0, 0, 1, 1] },
                strokeOpacity: { value: 0 },
            },
        });
        const picks = [];
        for (const domain of [
            [10, 30],
            [10, 20],
        ]) {
            handle.batchUpdates(() => {
                handle.scales.x.conditions[0].setDomain(domain, [0.5, 1]);
                handle.scales.x2.setDomain(domain, [0.5, 1]);
            });
            renderer.render({ draws: [{ mark: handle }] });
            await renderer.device.queue.onSubmittedWorkDone();
            picks.push(await renderer.pick(1, 25), await renderer.pick(4, 25));
        }
        const error = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return { picks, error: error?.message };
    });
    expect(result.picks).toEqual([null, 1, null, 1]);
    expect(result.error).toBeUndefined();
});
