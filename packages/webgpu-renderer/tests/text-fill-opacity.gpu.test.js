/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */

import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2]) {
    test(`text fill opacity remains independent of effects at DPR ${dpr}`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (dpr) => {
            const [
                { createRenderer },
                { textMark },
                { identityScale },
                { createTrueTypeFont },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/text.js"),
                import("/src/scales/identity.js"),
                import("/src/fonts/trueTypeFont.js"),
            ]);
            const font = createTrueTypeFont(
                await fetch("/src/fonts/DefaultFont.ttf").then((r) =>
                    r.arrayBuffer()
                )
            );
            const canvas = document.createElement("canvas");
            canvas.width = 256 * dpr;
            canvas.height = 128 * dpr;
            document.body.append(canvas);
            const renderer = await createRenderer(canvas, {
                format: "rgba8unorm",
            });
            renderer.context.configure({
                device: renderer.device,
                format: renderer.format,
                alphaMode: "premultiplied",
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.COPY_SRC,
            });
            renderer.updateGlobals({ width: 256, height: 128, dpr });
            renderer.device.pushErrorScope("validation");
            const buffer = renderer.device.createBuffer({
                size: canvas.width * canvas.height * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const labels = ["H", "H"];
            const colors = (factors) =>
                new Float32Array(
                    factors.flatMap((factor) => [0.2, 0.5, 0.8, 0.8 * factor])
                );
            const rows = [];
            const picks = [];
            async function capture(mark) {
                renderer.render({
                    items: [{ mark }],
                    clearColor: { r: 0, g: 0, b: 0, a: 0 },
                });
                const encoder = renderer.device.createCommandEncoder();
                encoder.copyTextureToBuffer(
                    { texture: renderer.context.getCurrentTexture() },
                    { buffer, bytesPerRow: canvas.width * 4 },
                    { width: canvas.width, height: canvas.height }
                );
                renderer.device.queue.submit([encoder.finish()]);
                await buffer.mapAsync(GPUMapMode.READ);
                const bytes = new Uint8Array(buffer.getMappedRange()).slice();
                buffer.unmap();
                return bytes;
            }
            try {
                for (const effects of [false, true]) {
                    const channels = {
                        text: { data: labels },
                        uniqueId: {
                            data: new Uint32Array([17, 18]),
                            type: "u32",
                        },
                        x: {
                            data: new Float32Array([64, 192]),
                            type: "f32",
                            scale: identityScale(),
                        },
                        y: { value: 64, scale: identityScale() },
                        size: { value: 32 },
                        fill: {
                            data: colors([1, 1]),
                            type: "f32",
                            components: 4,
                        },
                        opacity: { value: 0.6 },
                        ...(effects
                            ? {
                                  stroke: { value: [0.9, 0.2, 0.2, 0.7] },
                                  strokeWidth: { value: 4 },
                                  strokeOpacity: { value: 0.65 },
                                  shadowColor: { value: [0.1, 0.8, 0.2, 0.6] },
                                  shadowOpacity: { value: 0.5 },
                                  shadowOffsetX: { value: 12 },
                                  shadowOffsetY: { value: 8 },
                                  shadowBlur: { value: 3 },
                              }
                            : {}),
                    };
                    const reference = renderer.createMark(textMark, {
                        font,
                        fontSize: 32,
                        channels,
                    });
                    const actual = renderer.createMark(textMark, {
                        font,
                        fontSize: 32,
                        channels: {
                            ...channels,
                            fillOpacity: {
                                value: 1,
                                conditions: [
                                    {
                                        when: {
                                            selection: "selected",
                                            type: "multi",
                                            empty: false,
                                        },
                                        channel: {
                                            data: new Float32Array([
                                                0.25, 0.75,
                                            ]),
                                            type: "f32",
                                        },
                                    },
                                ],
                            },
                        },
                    });
                    try {
                        let first;
                        for (const [selected, factors, empty] of [
                            [[], [1, 1], false],
                            [[17], [0.25, 1], false],
                            [[17, 18], [0.25, 0.75], false],
                            [[17, 18], [0, 0], false],
                            [[17, 18], [0, 0], true],
                            [[], [1, 1], false],
                        ]) {
                            actual.selections.selected.set(
                                new Uint32Array(selected)
                            );
                            const series = {
                                text: empty ? ["", ""] : labels,
                                uniqueId: new Uint32Array([17, 18]),
                                x: new Float32Array([64, 192]),
                            };
                            actual.series.replace({
                                ...series,
                                fill: colors([1, 1]),
                                fillOpacity: new Float32Array(
                                    factors[0] === 0 ? [0, 0] : [0.25, 0.75]
                                ),
                            });
                            reference.series.replace({
                                ...series,
                                fill: colors(factors),
                            });
                            // Intrinsic paint alpha is an independent reference; no geometry or effect factors change.
                            const expected = await capture(reference);
                            const bytes = await capture(actual);
                            let error = 0,
                                ink = 0,
                                red = 0,
                                green = 0;
                            for (let i = 0; i < bytes.length; i++)
                                error = Math.max(
                                    error,
                                    Math.abs(bytes[i] - expected[i])
                                );
                            for (let i = 0; i < bytes.length; i += 4) {
                                ink += bytes[i + 3] > 0;
                                red += bytes[i] > bytes[i + 1] + 20;
                                green += bytes[i + 1] > bytes[i] + 20;
                            }
                            first ??= bytes;
                            rows.push({
                                effects,
                                empty,
                                zero: factors[0] === 0,
                                error,
                                ink,
                                red,
                                green,
                            });
                            picks.push(
                                await renderer.pick(64, 64),
                                await renderer.pick(192, 64)
                            );
                            if (rows.length % 6 === 0)
                                rows.at(-1).restored = bytes.every(
                                    (v, i) => v === first[i]
                                );
                        }
                    } finally {
                        renderer.destroyMark(actual.markId);
                        renderer.destroyMark(reference.markId);
                    }
                }
                return {
                    rows,
                    picks,
                    error:
                        (await renderer.device.popErrorScope())?.message ??
                        null,
                };
            } finally {
                buffer.destroy();
                renderer.destroy();
                canvas.remove();
            }
        }, dpr);
        expect(result.error).toBeNull();
        expect(result.rows).toHaveLength(12);
        for (const row of result.rows) {
            expect(row.error, JSON.stringify(row)).toBeLessThanOrEqual(2);
            if (row.empty || (row.zero && !row.effects))
                expect(row.ink).toBe(0);
            else expect(row.ink).toBeGreaterThan(100);
            if (row.zero && row.effects && !row.empty) {
                expect(row.red).toBeGreaterThan(20);
                expect(row.green).toBeGreaterThan(20);
            }
        }
        expect(
            result.rows
                .filter((row) => row.restored !== undefined)
                .every((row) => row.restored)
        ).toBe(true);
        for (const [index, row] of result.rows.entries()) {
            expect(result.picks.slice(index * 2, index * 2 + 2)).toEqual(
                row.empty ? [null, null] : [17, 18]
            );
        }
    });
}
