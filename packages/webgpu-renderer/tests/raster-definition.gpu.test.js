import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("raster conditions and order operate on cells across tile replacement", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer, rgba8Unorm },
            { rasterMark },
            { thresholdScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/raster.js"),
            import("/src/scales/threshold.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas, { format: "rgba8unorm" });
        const { device } = renderer;
        renderer.context.configure({
            device,
            format: renderer.format,
            alphaMode: "premultiplied",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        renderer.updateGlobals({ width: 64, height: 64, dpr: 1 });
        device.pushErrorScope("validation");

        const starts = new Float32Array([0, 0]);
        const ends = new Float32Array([64, 64]);
        const data = {
            tiles: {
                x0: starts,
                y0: starts,
                x1: ends,
                y1: ends,
                columns: new Uint32Array([2, 2]),
                rows: new Uint32Array([1, 1]),
                offsets: new Uint32Array([0, 2]),
            },
            cells: {
                rgba: new Uint32Array([
                    0xff0000ff, 0xff0000ff, 0xffff0000, 0xffff0000,
                ]),
                signal: new Float32Array([1, 0, 0, 0]),
                quality: new Float32Array([0.5, 0.5, 0.5, 0.5]),
            },
        };
        /** @type {import("../src/index.js").SelectionPredicate} */
        const when = {
            selection: "signalRange",
            type: "interval",
            projections: [{ component: "signal", input: "signal" }],
            empty: false,
        };
        /** @type {import("../src/marks/raster.js").RasterConfig} */
        const config = {
            data,
            channels: {
                fill: { input: "rgba", scale: rgba8Unorm },
                opacity: {
                    input: "quality",
                    conditions: [{ when, value: 0.25 }],
                },
            },
        };
        const unordered = renderer.createMark(rasterMark, config);
        const ordered = renderer.createMark(rasterMark, {
            ...config,
            order: { when, matching: "last" },
        });
        /** @param {typeof ordered} mark */
        const read = async (mark) => {
            const program = renderer._marks.get(mark.markId);
            const draw = program.draw;
            let draws = 0;
            program.draw = function (...args) {
                draws++;
                draw.apply(this, args);
            };
            renderer.render({
                draws: [{ mark }],
                clearColor: { r: 0, g: 0, b: 0, a: 0 },
            });
            program.draw = draw;

            const buffer = device.createBuffer({
                size: 64 * 64 * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: renderer.context.getCurrentTexture() },
                { buffer, bytesPerRow: 64 * 4 },
                { width: 64, height: 64 }
            );
            device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            const bytes = new Uint8Array(buffer.getMappedRange());
            const pixels = [16, 48].map((x) => {
                const offset = (32 * 64 + x) * 4;
                return Array.from(bytes.slice(offset, offset + 4));
            });
            buffer.destroy();
            return { draws, pixels };
        };
        const idle = await read(ordered);
        for (const mark of [unordered, ordered]) {
            mark.selections.signalRange.set({ signal: [1, 2] });
        }
        const selected = await read(ordered);
        const unpromoted = await read(unordered);

        const next = {
            tiles: {
                x0: new Float32Array([0]),
                x1: new Float32Array([32]),
                y0: new Float32Array([16]),
                y1: new Float32Array([64]),
                columns: new Uint32Array([1]),
                rows: new Uint32Array([1]),
                offsets: new Uint32Array([0]),
            },
            cells: {
                rgba: new Uint32Array([0xff00ff00]),
                signal: new Float32Array([0]),
                quality: new Float32Array([1]),
            },
        };
        ordered.series.replace(next);
        const replaced = await read(ordered);
        let invalid;
        try {
            ordered.series.replace({
                ...next,
                cells: { ...next.cells, rgba: new Uint32Array([0xff0000ff]) },
                tiles: { ...next.tiles, offsets: new Uint32Array([1]) },
            });
        } catch (error) {
            invalid = error.message;
        }
        const rejected = await read(ordered);
        const emptyData = {
            tiles: Object.fromEntries(
                Object.keys(next.tiles).map((name) => [
                    name,
                    next.tiles[name].subarray(0, 0),
                ])
            ),
            cells: Object.fromEntries(
                Object.keys(next.cells).map((name) => [
                    name,
                    next.cells[name].subarray(0, 0),
                ])
            ),
        };
        ordered.series.replace(/** @type {typeof next} */ (emptyData));
        const emptied = await read(ordered);

        const withMissing = renderer.createMark(rasterMark, {
            data: {
                tiles: next.tiles,
                cells: {
                    color: new Float32Array([NaN]),
                    signal: new Float32Array([1]),
                    quality: new Float32Array([1]),
                },
            },
            scalarSlots: { visibleQuality: { value: 0.5, type: "f32" } },
            visibleWhen: {
                compare: ">",
                left: { channel: "opacity" },
                right: { slot: "visibleQuality" },
            },
            channels: {
                fill: {
                    input: "color",
                    scale: thresholdScale({
                        domain: [0],
                        range: [
                            [1, 0, 0, 1],
                            [0, 0, 1, 1],
                        ],
                    }),
                    conditions: [
                        {
                            when,
                            channel: {
                                input: "signal",
                                scale: thresholdScale({
                                    domain: [0.5],
                                    range: [
                                        [0, 0, 0, 1],
                                        [0, 1, 0, 1],
                                    ],
                                }),
                            },
                        },
                    ],
                },
                opacity: { input: "quality" },
            },
        });
        const missing = await read(withMissing);
        withMissing.selections.signalRange.set({ signal: [1, 2] });
        const conditionOverridesMissing = await read(withMissing);
        withMissing.scalarSlots.visibleQuality.set(1);
        const hidden = await read(withMissing);
        const validation = await device.popErrorScope();
        renderer.destroy();
        return {
            idle,
            selected,
            unpromoted,
            replaced,
            rejected,
            emptied,
            missing,
            conditionOverridesMissing,
            hidden,
            invalid,
            validation: validation?.message,
        };
    });
    expect(result.validation).toBeUndefined();
    expect(result.idle.draws).toBe(1);
    expect(result.unpromoted.draws).toBe(1);
    expect(result.selected.draws).toBe(2);
    expect(result.selected.pixels[0].slice(0, 3)).toEqual([64, 0, 96]);
    expect(result.unpromoted.pixels[0].slice(0, 3)).toEqual([32, 0, 128]);
    for (const { pixels } of [result.selected, result.unpromoted]) {
        expect(Math.abs(pixels[0][3] - 159.375)).toBeLessThan(1);
    }
    expect(result.selected.pixels[1]).toEqual(result.idle.pixels[1]);
    expect(result.replaced.pixels).toEqual([
        [0, 255, 0, 255],
        [0, 0, 0, 0],
    ]);
    expect(result.invalid).toMatch(/invalid dimensions or cell offset/);
    expect(result.rejected).toEqual(result.replaced);
    expect(result.emptied.pixels).toEqual([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ]);
    expect(result.missing.pixels[0]).toEqual([0, 0, 0, 0]);
    expect(result.conditionOverridesMissing.pixels[0]).toEqual([
        0, 255, 0, 255,
    ]);
    expect(result.hidden.pixels[0]).toEqual([0, 0, 0, 0]);
});
