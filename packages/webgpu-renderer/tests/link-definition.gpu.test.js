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

for (const [
    shape,
    orient,
    direction,
    dpr,
    selectionType = "single",
    hasUniqueId = true,
] of [
    ["dome", "vertical", -1, 1],
    ["dome", "vertical", 1, 2],
    ["dome", "horizontal", -1, 2],
    ["dome", "horizontal", 1, 1],
    ["arc", "vertical", -1, 2],
    ["dome", "vertical", -1, 2, "interval", true],
    ["dome", "vertical", -1, 2, "interval", false],
]) {
    test(`${shape} ${orient} ${direction} ${selectionType} uniqueId=${hasUniqueId} fades in logical pixels and respects selection and picking`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(
            async ({
                shape,
                orient,
                direction,
                dpr,
                selectionType,
                hasUniqueId,
            }) => {
                const [{ createRenderer }, { linkMark }] = await Promise.all([
                    import("/src/index.js"),
                    import("/src/marks/link.js"),
                ]);
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 128 * dpr;
                document.body.appendChild(canvas);
                const renderer = await createRenderer(canvas);
                renderer.context.configure({
                    device: renderer.device,
                    format: renderer.format,
                    alphaMode: "premultiplied",
                    usage:
                        GPUTextureUsage.RENDER_ATTACHMENT |
                        GPUTextureUsage.COPY_SRC,
                });
                renderer.updateGlobals({ width: 128, height: 128, dpr });
                const baseline = direction < 0 ? 100 : 28;
                const height = shape == "arc" ? 48 : 80;
                const transpose = (x, y) =>
                    orient == "vertical" ? [x, y] : [y, x];
                const a = transpose(
                    16,
                    shape == "arc" ? baseline : baseline + direction * height
                );
                const b = transpose(112, baseline);
                const mark = renderer.createMark(linkMark, {
                    count: 1,
                    linkShape: shape,
                    orient,
                    segments: 101,
                    arcFadingDistance: [height * 0.4, height * 0.8],
                    channels: {
                        ...(hasUniqueId
                            ? { uniqueId: { value: 17, type: "u32" } }
                            : {}),
                        x: { value: a[0] },
                        y: { value: a[1] },
                        x2: { value: b[0] },
                        y2: { value: b[1] },
                        size: { value: 6 },
                        color: {
                            value: [1, 0, 0, 1],
                            conditions: [
                                {
                                    when: {
                                        selection: "selected",
                                        type: selectionType,
                                        empty: true,
                                        ...(selectionType == "interval"
                                            ? {
                                                  targets: [
                                                      {
                                                          input: "x",
                                                          secondaryInput: "x2",
                                                          hitTest: "endpoints",
                                                      },
                                                      {
                                                          input: "y",
                                                          secondaryInput: "y2",
                                                          hitTest: "endpoints",
                                                      },
                                                  ],
                                              }
                                            : {}),
                                    },
                                    value: [1, 0, 0, 1],
                                },
                            ],
                        },
                    },
                });
                const points = [0.02, 0.2, 0.5].map((t) =>
                    transpose(
                        16 + 96 * t * t * (3 - 2 * t),
                        baseline + direction * height * 4 * t * (1 - t)
                    )
                );
                const read = async () => {
                    renderer.render({
                        draws: [{ mark }],
                        clearColor: { r: 0, g: 0, b: 0, a: 0 },
                    });
                    const bytesPerRow = canvas.width * 4;
                    const buffer = renderer.device.createBuffer({
                        size: bytesPerRow * canvas.height,
                        usage:
                            GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                    });
                    const encoder = renderer.device.createCommandEncoder();
                    encoder.copyTextureToBuffer(
                        { texture: renderer.context.getCurrentTexture() },
                        { buffer, bytesPerRow },
                        { width: canvas.width, height: canvas.height }
                    );
                    renderer.device.queue.submit([encoder.finish()]);
                    await buffer.mapAsync(GPUMapMode.READ);
                    const bytes = new Uint8Array(buffer.getMappedRange());
                    const alpha = points.map(
                        ([x, y]) =>
                            bytes[
                                Math.floor(y * dpr) * bytesPerRow +
                                    Math.floor(x * dpr) * 4 +
                                    3
                            ]
                    );
                    buffer.unmap();
                    buffer.destroy();
                    const picks = [];
                    for (const [x, y] of points) {
                        picks.push(await renderer.pick(x, y));
                    }
                    return { alpha, picks };
                };
                const faded = await read();
                const intervalStates = [];
                if (selectionType == "interval") {
                    // Span intersection, partial/empty selections, and misses stay faded.
                    for (const intervals of [
                        { x: [40, 80], y: [0, 128] },
                        { x: [12, 20], y: null },
                        { x: [0, 5], y: [0, 128] },
                    ]) {
                        mark.selections.selected.set(intervals);
                        intervalStates.push(await read());
                    }
                    mark.selections.selected.set({ x: [12, 20], y: [16, 24] });
                } else {
                    mark.selections.selected.set(17);
                }
                const selected = await read();
                mark.properties.noFadingOnPointSelection.set(false);
                const forced = await read();
                mark.properties.arcFadingDistance.set([0, 0]);
                const disabled = await read();
                renderer.destroy();
                canvas.remove();
                return { faded, selected, forced, disabled, intervalStates };
            },
            { shape, orient, direction, dpr, selectionType, hasUniqueId }
        );
        for (const faded of [
            result.faded,
            result.forced,
            ...result.intervalStates,
            ...(!hasUniqueId ? [result.selected] : []),
        ]) {
            expect(faded.alpha[0]).toBeGreaterThan(240);
            expect(faded.alpha[1]).toBeGreaterThan(65);
            expect(faded.alpha[1]).toBeLessThan(115);
            expect(faded.alpha[2]).toBe(0);
            expect(faded.picks).toEqual(
                hasUniqueId ? [17, 17, null] : [null, null, null]
            );
        }
        for (const unfaded of [
            result.disabled,
            ...(hasUniqueId ? [result.selected] : []),
        ]) {
            expect(unfaded.alpha.every((alpha) => alpha > 240)).toBe(true);
            expect(unfaded.picks).toEqual(
                hasUniqueId ? [17, 17, 17] : [null, null, null]
            );
        }
    });
}
