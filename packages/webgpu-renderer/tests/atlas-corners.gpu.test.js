/* global document, GPUBufferUsage, GPUMapMode, GPUTextureUsage */
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("atlas corner distances survive competing edges and scratch reuse", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { MsdfAtlasGenerator },
            { renderPathMsdf },
            { svgPathToGlyphPath },
        ] = await Promise.all([
            import("/src/symbols/sparseGpuPathAtlas.js"),
            import("/tests/oracles/msdfgen/pathRasterizer.js"),
            import("/src/vendor/vegaScenegraph/toGlyphPath.js"),
        ]);
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        device.pushErrorScope("validation");
        const generator = new MsdfAtlasGenerator(device);
        const atlases = [];
        /** @param {number} r @param {number} g @param {number} b */
        const median = (r, g, b) =>
            Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        /** @param {number} word */
        const half = (word) => {
            const sign = word & 0x8000 ? -1 : 1;
            const exponent = (word >> 10) & 31;
            const fraction = word & 1023;
            return (
                sign *
                (exponent === 0
                    ? fraction * 2 ** -24
                    : (1 + fraction / 1024) * 2 ** (exponent - 15))
            );
        };
        /** @param {ReturnType<MsdfAtlasGenerator["createAtlas"]>} atlas */
        async function read(atlas) {
            await atlas.completion;
            const pitch = Math.ceil((atlas.width * 8) / 256) * 256;
            const buffer = device.createBuffer({
                size: pitch * atlas.height,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: atlas.texture },
                { buffer, bytesPerRow: pitch },
                { width: atlas.width, height: atlas.height }
            );
            device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            const words = new Uint16Array(buffer.getMappedRange());
            const values = Float32Array.from(
                { length: atlas.width * atlas.height * 4 },
                (_, index) =>
                    half(
                        words[
                            (Math.floor(index / (atlas.width * 4)) * pitch) /
                                2 +
                                (index % (atlas.width * 4))
                        ]
                    )
            );
            buffer.unmap();
            buffer.destroy();
            return values;
        }
        /** @param {Float32Array} values @param {number} width @param {number} x @param {number} y */
        function sample(values, width, x, y) {
            const ix = Math.floor(x - 0.5),
                iy = Math.floor(y - 0.5);
            const fx = x - 0.5 - ix,
                fy = y - 0.5 - iy;
            /** @param {number} xx @param {number} yy @param {number} c */
            const channel = (xx, yy, c) => values[(yy * width + xx) * 4 + c];
            return median(
                ...[0, 1, 2].map(
                    (c) =>
                        (1 - fy) *
                            ((1 - fx) * channel(ix, iy, c) +
                                fx * channel(ix + 1, iy, c)) +
                        fy *
                            ((1 - fx) * channel(ix, iy + 1, c) +
                                fx * channel(ix + 1, iy + 1, c))
                )
            );
        }
        try {
            // Queue a large, smaller, then large layout before readback; angle data
            // must follow the current layout rather than retained scratch capacity.
            const largePaths = [
                "M-1-1H1V1H-1Z",
                "M0-1L1 1H-1Z",
                "M0-1Q1-1 1 0Q1 1 0 1Q-1 1-1 0Q-1-1 0-1Z",
            ];
            const largeOptions = {
                tileSize: 192,
                shapePadding: 40,
                spread: 32,
            };
            const firstLarge = generator.createAtlas(largePaths, largeOptions);
            atlases.push(firstLarge);
            // Original bundled-font bar contours, with reflected winding.
            const rectangle = generator.createAtlas(
                [
                    "M181 -1533L320 -1533L320 349L181 349Z",
                    "M-181 -1533L-320 -1533L-320 349L-181 349Z",
                ],
                {
                    tileSize: 128,
                    shapePadding: 24,
                    spread: 24,
                    gutter: 1,
                    tightPacking: true,
                    normalizationSpan: 2000,
                }
            );
            const resumedLarge = generator.createAtlas(
                largePaths,
                largeOptions
            );
            atlases.push(rectangle, resumedLarge);
            const values = await read(rectangle);
            const [firstValues, resumedValues] = await Promise.all([
                read(firstLarge),
                read(resumedLarge),
            ]);
            let reuseError = 0;
            for (let i = 0; i < firstValues.length; i++) {
                reuseError = Math.max(
                    reuseError,
                    Math.abs(firstValues[i] - resumedValues[i])
                );
            }
            const corners = [];
            for (const job of rectangle.jobs) {
                const left =
                    job.slotX + job.gutter + (job.tileWidth - 139 * 0.04) / 2;
                const right = left + 139 * 0.04;
                const top =
                    job.slotY + job.gutter + (job.tileHeight - 1882 * 0.04) / 2;
                const bottom = top + 1882 * 0.04;
                for (const x of [left, right])
                    for (const y of [top + 0.01, bottom - 0.01]) {
                        corners.push(
                            Math.abs(sample(values, rectangle.width, x, y))
                        );
                    }
            }
            // Calibrate the oracle independently: half a pixel inside/outside a
            // known rectangle must decode to +/-0.5, including its full range.
            const calibrationImage = renderPathMsdf(
                svgPathToGlyphPath("M0 0H10V10H0Z"),
                {
                    width: 16,
                    height: 16,
                    scale: 1,
                    offsetX: 3,
                    offsetY: 3,
                    spread: 1,
                }
            );
            const calibration = [2, 3].map((x) => {
                const offset = (8 * 16 + x) * 3;
                return (
                    2 *
                    (median(
                        ...calibrationImage.buffer.slice(offset, offset + 3)
                    ) /
                        255 -
                        0.5)
                );
            });
            // The two endpoint alignments share the same seven-bit bucket but
            // have different perpendicular distances. Test sign/order too.
            const a = 0.99999,
                b = 0.9961;
            const ay = Math.sqrt(1 - a * a),
                by = Math.sqrt(1 - b * b);
            const points = [
                [-a, -ay],
                [0, 0],
                [(-b * ay) / by, ay],
            ];
            const paths = [
                points,
                points
                    .slice()
                    .reverse()
                    .map(([x, y]) => [-x, y]),
            ].map(
                (points) => "M" + points.map((p) => p.join(" ")).join("L") + "Z"
            );
            const tied = generator.createAtlas(paths, {
                tileSize: 128,
                shapePadding: 24,
                spread: 24,
                gutter: 1,
                tightPacking: true,
                normalizationSpan: 80,
            });
            atlases.push(tied);
            const tiedValues = await read(tied);
            const errors = paths.map((path, index) => {
                const outline = svgPathToGlyphPath(path),
                    bounds = outline.bounds;
                const job = tied.jobs[index];
                const reference = renderPathMsdf(outline, {
                    width: job.tileWidth,
                    height: job.tileHeight,
                    scale: 1,
                    offsetX:
                        (job.tileWidth - bounds.xMax + bounds.xMin) / 2 -
                        bounds.xMin,
                    offsetY:
                        (job.tileHeight - bounds.yMax + bounds.yMin) / 2 -
                        bounds.yMin,
                    spread: 1,
                });
                const x = index ? job.tileWidth - 1 - 35 : 35,
                    y = 24;
                const offset = (y * job.tileWidth + x) * 3;
                const expected =
                    2 *
                    (median(...reference.buffer.slice(offset, offset + 3)) /
                        255 -
                        0.5);
                const actual = sample(
                    tiedValues,
                    tied.width,
                    job.slotX + job.gutter + x + 0.5,
                    job.slotY + job.gutter + y + 0.5
                );
                return Math.abs(actual - expected);
            });
            await Promise.all(atlases.map((atlas) => atlas.completion));
            return {
                corners,
                reuseError,
                calibration,
                errors,
                validation: await device.popErrorScope(),
            };
        } finally {
            for (const atlas of atlases) atlas.destroy();
            generator.destroy();
            device.destroy();
        }
    });
    expect(result.validation).toBeNull();
    expect(result.reuseError).toBe(0);
    expect(result.calibration[0]).toBeCloseTo(-0.5, 2);
    expect(result.calibration[1]).toBeCloseTo(0.5, 2);
    for (const error of result.corners) expect(error).toBeLessThan(0.001);
    for (const error of result.errors)
        expect(error).toBeLessThanOrEqual(2 / 255);
});

test("path square corners match analytic rectangle rendering", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { pointMark },
            { rectMark },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/point.js"),
            import("/src/marks/rect.js"),
            import("/src/scales/identity.js"),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const renderer = await createRenderer(canvas, { format: "rgba8unorm" });
        renderer.context.configure({
            device: renderer.device,
            format: renderer.format,
            alphaMode: "premultiplied",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        renderer.updateGlobals({ width: 32, height: 32, dpr: 2 });
        renderer.device.pushErrorScope("validation");
        const buffer = renderer.device.createBuffer({
            size: 64 * 64 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        /** @param {import("../src/index.js").MarkHandle} mark */
        async function capture(mark) {
            renderer.render({
                items: [{ mark }],
                clearColor: { r: 0, g: 0, b: 0, a: 0 },
            });
            const encoder = renderer.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: renderer.context.getCurrentTexture() },
                { buffer, bytesPerRow: 256 },
                { width: 64, height: 64 }
            );
            renderer.device.queue.submit([encoder.finish()]);
            await buffer.mapAsync(GPUMapMode.READ);
            const bytes = new Uint8Array(buffer.getMappedRange()).slice();
            buffer.unmap();
            return bytes;
        }
        const paint = {
            fill: { value: [1, 0, 0, 0.8] },
            stroke: { value: [0, 0, 1, 0.5] },
            strokeWidth: { value: 0.25 },
            strokeAlign: { value: 1, type: "u32" },
        };
        const errors = [];
        let referencesPainted = true;
        try {
            // Fractional placement exposes interpolation errors at tiny and ordinary corners.
            for (const diameter of [1, 8]) {
                const center = 16.375;
                const point = renderer.createMark(pointMark, {
                    count: 1,
                    shape: "square",
                    channels: {
                        ...paint,
                        x: { value: center, scale: identityScale() },
                        y: { value: center, scale: identityScale() },
                        size: { value: diameter ** 2 },
                    },
                });
                const rectangle = renderer.createMark(rectMark, {
                    count: 1,
                    channels: {
                        ...paint,
                        x: {
                            value: center - diameter / 2,
                            scale: identityScale(),
                        },
                        y: {
                            value: center - diameter / 2,
                            scale: identityScale(),
                        },
                        x2: {
                            value: center + diameter / 2,
                            scale: identityScale(),
                        },
                        y2: {
                            value: center + diameter / 2,
                            scale: identityScale(),
                        },
                        minWidth: { value: 0 },
                        minHeight: { value: 0 },
                    },
                });
                const actual = await capture(point);
                const expected = await capture(rectangle);
                referencesPainted &&= expected.some(
                    (value, index) => index % 4 === 3 && value > 0
                );
                errors.push(
                    Math.max(
                        ...actual.map((value, i) =>
                            Math.abs(value - expected[i])
                        )
                    )
                );
                renderer.destroyMark(point.markId);
                renderer.destroyMark(rectangle.markId);
            }
            return {
                errors,
                referencesPainted,
                validation: await renderer.device.popErrorScope(),
            };
        } finally {
            buffer.destroy();
            renderer.destroy();
        }
    });
    expect(result.validation).toBeNull();
    expect(result.referencesPainted).toBe(true);
    expect(result.errors).toEqual([0, 0]);
});
