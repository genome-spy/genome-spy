import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("raster position follows a moving icon independently of its cell fields", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const pixels = await page.evaluate(async () => {
        const { createReadbackRenderer } =
            await import("/tests/fixtures/rgbaReadback.js");
        const { rasterMark } = await import("/src/marks/raster.js");
        const { renderer, renderPixels, finish } =
            await createReadbackRenderer(64);
        const mark = renderer.createMark(rasterMark, {
            data: {
                tiles: {
                    columns: new Uint32Array([1]),
                    rows: new Uint32Array([1]),
                    offsets: new Uint32Array([0]),
                },
                cells: { x: new Float32Array([1]) },
            },
            position: {
                x: { value: 16, dynamic: true },
                y: { value: 32 },
                size: { value: 64 },
            },
            visibleWhen: {
                selection: "brush",
                type: "interval",
                projections: [
                    { component: "anchor", position: "x" },
                    { component: "value", input: "x" },
                ],
                empty: false,
            },
            channels: { fill: { value: [1, 0, 0, 1] } },
        });
        mark.selections.brush.set({ anchor: [40, 56], value: [0, 2] });
        const before = await renderPixels(mark, [[16, 32]]);
        mark.values.x.set(48);
        const after = await renderPixels(mark, [[48, 32]]);
        mark.selections.brush.set({ anchor: [40, 56], value: [2, 3] });
        const excluded = await renderPixels(mark, [[48, 32]]);
        await finish();
        return [before, after, excluded];
    });
    expect(pixels).toEqual([
        [[0, 0, 0, 0]],
        [[255, 0, 0, 255]],
        [[0, 0, 0, 0]],
    ]);
});

test("raster conditions and order operate on cells across tile replacement", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { rgba8Unorm },
            { createReadbackRenderer },
            { rasterMark },
            { thresholdScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/tests/fixtures/rgbaReadback.js"),
            import("/src/marks/raster.js"),
            import("/src/scales/threshold.js"),
        ]);
        const { renderer, renderPixels, finish } =
            await createReadbackRenderer(64);

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
            const pixels = renderPixels(mark, [
                [16, 32],
                [48, 32],
            ]);
            program.draw = draw;
            return { draws, pixels: await pixels };
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
                left: { input: "quality" },
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
        const validation = await finish();
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
            validation,
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

test("raster footprints filter encoded colors through zoom and selection", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [{ createReadbackRenderer }, { rasterMark }, { ordinalScale }] =
            await Promise.all([
                import("/tests/fixtures/rgbaReadback.js"),
                import("/src/marks/raster.js"),
                import("/src/scales/ordinal.js"),
            ]);
        const { renderer, renderPixels, finish } =
            await createReadbackRenderer(64);

        // At (16, 32) the four categories cover different areas of the pixel.
        /** @param {number} x0 @param {number} x1 @param {number} y0 @param {number} y1 */
        const data = (x0, x1, y0, y1) => ({
            tiles: {
                x0: new Float32Array([x0]),
                x1: new Float32Array([x1]),
                y0: new Float32Array([y0]),
                y1: new Float32Array([y1]),
                columns: new Uint32Array([2]),
                rows: new Uint32Array([2]),
                offsets: new Uint32Array([0]),
            },
            cells: { base: new Uint32Array([11, 29, 47, 83]) },
        });
        const mark = renderer.createMark(rasterMark, {
            data: data(0.25, 32.25, 0.75, 64.75),
            channels: {
                fill: {
                    input: "base",
                    scale: ordinalScale({
                        domain: [11, 29, 47, 83],
                        range: [
                            [1, 0, 0, 1],
                            [0, 0, 1, 1],
                            [0, 1, 0, 1],
                            [1, 1, 1, 1],
                        ],
                    }),
                },
            },
            visibleWhen: { selection: "bases", type: "multi", input: "base" },
        });
        mark.selections.bases.set(new Uint32Array([11, 29, 47]));

        const sample = async () => (await renderPixels(mark, [[16, 32]]))[0];
        const first = await sample();
        mark.series.replace(data(0.75, 32.75, 0.75, 64.75));
        const moved = await sample();
        mark.series.replace(data(16, 17, 32, 33));
        const minified = await sample();
        const validation = await finish();
        return {
            pixels: [first, moved, minified],
            validation,
        };
    });

    expect(result.validation).toBeUndefined();
    const weights = [
        [0.1875, 0.0625, 0.5625, 0.8125],
        [0.5625, 0.1875, 0.1875, 0.9375],
        [0.25, 0.25, 0.25, 0.75],
    ];
    for (const [i, pixel] of result.pixels.entries()) {
        pixel.forEach((value, channel) =>
            expect(Math.abs(value - 255 * weights[i][channel])).toBeLessThan(1)
        );
    }
});
