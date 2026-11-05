/* global document, GPUTextureUsage, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { ensureWebGPU } from "./gpuTestUtils.js";

for (const dpr of [1, 2])
    test(
        "line union area actual point program DPR " + dpr,
        async ({ page }, testInfo) => {
            await ensureWebGPU(page);
            const result = await page.evaluate(async (dpr) => {
                const [
                    { createRenderer },
                    { lineUnionAreaPointMark },
                    { identityScale },
                ] = await Promise.all([
                    import("/src/index.js"),
                    import("/tests/fixtures/lineUnionAreaPointMark.js"),
                    import("/src/scales/identity.js"),
                ]);
                const canvas = document.createElement("canvas");
                canvas.width = 64 * dpr;
                canvas.height = 64 * dpr;
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
                renderer.updateGlobals({ width: 64, height: 64, dpr });
                renderer.device.pushErrorScope("validation");
                const buffer = renderer.device.createBuffer({
                    size: canvas.width * canvas.height * 4,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                const rows = [];
                const horizontal = [-0.5, 0, 0.5, 0],
                    vertical = [0, -0.5, 0, 0.5];
                const cases = [
                    {
                        name: "strip .1",
                        segments: [horizontal],
                        diameter: 4,
                        width: 0.1,
                        expectedCenter: 0.1,
                    },
                    {
                        name: "cross .19",
                        segments: [horizontal, vertical],
                        diameter: 4,
                        width: 0.1,
                        expectedCenter: 0.19,
                    },
                    {
                        name: "short box .01",
                        segments: [horizontal],
                        diameter: 0.1,
                        width: 0.1,
                        expectedCenter: 0.01,
                    },
                    {
                        name: "rotated fractional strip",
                        segments: [horizontal],
                        diameter: 7.3,
                        width: 0.37,
                        angle: 31,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "rotated crossing",
                        segments: [horizontal, vertical],
                        diameter: 7.3,
                        width: 0.37,
                        angle: 31,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "duplicate strip",
                        segments: [horizontal, horizontal],
                        diameter: 4,
                        width: 0.1,
                        expectedCenter: 0.1,
                    },
                    {
                        name: "reversed directions",
                        segments: [
                            vertical.slice(2).concat(vertical.slice(0, 2)),
                            horizontal.slice(2).concat(horizontal.slice(0, 2)),
                        ],
                        diameter: 4,
                        width: 0.1,
                        expectedCenter: 0.19,
                    },
                    {
                        name: "partially coincident",
                        segments: [
                            [-0.5, 0, 0.2, 0],
                            [-0.1, 0, 0.5, 0],
                        ],
                        diameter: 9,
                        width: 0.3,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "touching endpoints",
                        segments: [
                            [-0.5, 0, 0, 0],
                            [0, 0, 0.5, 0],
                        ],
                        diameter: 9,
                        width: 0.3,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "opposite touching sides",
                        segments: [
                            [-0.5, -0.05, 0.5, -0.05],
                            [-0.5, 0.05, 0.5, 0.05],
                        ],
                        diameter: 4,
                        width: 0.4,
                    },
                    {
                        name: "triple overlap",
                        segments: [
                            horizontal,
                            vertical,
                            [-0.5, -0.4, 0.5, 0.4],
                        ],
                        diameter: 9,
                        width: 0.7,
                        angle: 23,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "triple overlap reordered",
                        segments: [
                            [-0.5, -0.4, 0.5, 0.4],
                            vertical,
                            horizontal,
                        ],
                        diameter: 9,
                        width: 0.7,
                        angle: 23,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "near parallel",
                        segments: [horizontal, [-0.5, -0.00001, 0.5, 0.00001]],
                        diameter: 11,
                        width: 0.1,
                        angle: 12,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "near parallel reordered",
                        segments: [[-0.5, -0.00001, 0.5, 0.00001], horizontal],
                        diameter: 11,
                        width: 0.1,
                        angle: 12,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "asymmetric",
                        segments: [
                            [-0.5, -0.2, 0.25, -0.2],
                            [0.1, -0.4, 0.4, 0.5],
                            [-0.2, 0.15, -0.35, 0.45],
                        ],
                        diameter: 17,
                        width: 1.3,
                        angle: 19,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "tiny thick",
                        segments: [horizontal, vertical],
                        diameter: 0.1,
                        width: 12,
                        angle: 37,
                        x: 32.23,
                        y: 31.79,
                    },
                    {
                        name: "six segments",
                        segments: [
                            horizontal,
                            vertical,
                            [-0.5, -0.5, 0.5, 0.5],
                            [-0.5, 0.5, 0.5, -0.5],
                            [-0.5, -0.1, 0.5, 0.3],
                            [-0.4, -0.5, 0.2, 0.5],
                        ],
                        diameter: 15,
                        width: 0.7,
                        angle: 17,
                        x: 32.23,
                        y: 31.79,
                    },
                ];
                for (const slope of [0.000001, 0.0001])
                    for (const width of [0.05, 0.9])
                        cases.push({
                            name:
                                "near parallel slope " +
                                slope +
                                " width " +
                                width,
                            segments: [horizontal, [-0.5, -slope, 0.5, slope]],
                            diameter: 23,
                            width,
                            angle: 37,
                            x: 31.87,
                            y: 32.13,
                        });
                cases.push({
                    ...cases.find((c) => c.name === "partially coincident"),
                    name: "rotated partial coincidence",
                    angle: 43,
                });
                const asymmetric = cases.find((c) => c.name === "asymmetric");
                cases.push({
                    ...asymmetric,
                    name: "asymmetric reversed",
                    segments: asymmetric.segments
                        .slice()
                        .reverse()
                        .map((s) => s.slice(2).concat(s.slice(0, 2))),
                });
                for (const segments of [
                    [horizontal, vertical],
                    [horizontal, vertical, [-0.5, -0.4, 0.5, 0.4]],
                    cases.find((c) => c.name === "six segments").segments,
                ])
                    cases.push({
                        name: "cost fixture " + segments.length,
                        segments,
                        diameter: 4 * dpr,
                        width: 2 * dpr,
                        angle: 17,
                    });
                // Independent CPU reference: convex clipping and inclusion-exclusion.
                // It does not use the shader's boundary integral or interval traversal.
                const cross = (a, b, p) =>
                    (b[0] - a[0]) * (p[1] - a[1]) -
                    (b[1] - a[1]) * (p[0] - a[0]);
                function clip(poly, boundary) {
                    for (let i = 0; i < boundary.length && poly.length; i++) {
                        const a = boundary[i],
                            b = boundary[(i + 1) % boundary.length],
                            next = [];
                        for (let j = 0; j < poly.length; j++) {
                            const p = poly[j],
                                q = poly[(j + 1) % poly.length],
                                dp = cross(a, b, p),
                                dq = cross(a, b, q);
                            if (dp >= 0) next.push(p);
                            if (dp >= 0 !== dq >= 0) {
                                const t = dp / (dp - dq);
                                next.push([
                                    p[0] + t * (q[0] - p[0]),
                                    p[1] + t * (q[1] - p[1]),
                                ]);
                            }
                        }
                        poly = next;
                    }
                    return poly;
                }
                const area = (poly) =>
                    Math.abs(
                        poly.reduce((sum, p, i) => {
                            const q = poly[(i + 1) % poly.length];
                            return sum + p[0] * q[1] - p[1] * q[0];
                        }, 0)
                    ) * 0.5;
                function referencePolygons(c) {
                    const angle = ((c.angle ?? 0) * Math.PI) / 180,
                        cs = Math.cos(angle),
                        sn = Math.sin(angle),
                        x = (c.x ?? 32 + 0.5 / dpr) * dpr,
                        y = (c.y ?? 32 + 0.5 / dpr) * dpr;
                    const transform = (x, y) => [
                        x * cs - y * sn,
                        x * sn + y * cs,
                    ];
                    return c.segments.map((s) => {
                        const a = transform(
                                s[0] * c.diameter,
                                s[1] * c.diameter
                            ),
                            b = transform(s[2] * c.diameter, s[3] * c.diameter);
                        const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
                            nx = ((-(b[1] - a[1]) / length) * c.width) / 2,
                            ny = (((b[0] - a[0]) / length) * c.width) / 2;
                        return [
                            [x + a[0] - nx, y + a[1] - ny],
                            [x + b[0] - nx, y + b[1] - ny],
                            [x + b[0] + nx, y + b[1] + ny],
                            [x + a[0] + nx, y + a[1] + ny],
                        ];
                    });
                }
                async function render(c, alpha = 1) {
                    const mark = renderer.createMark(lineUnionAreaPointMark, {
                        count: 1,
                        proofSegments: c.segments,
                        channels: {
                            x: {
                                value: c.x ?? 32 + 0.5 / dpr,
                                scale: identityScale(),
                            },
                            y: {
                                value: c.y ?? 32 + 0.5 / dpr,
                                scale: identityScale(),
                            },
                            size: { value: (c.diameter / dpr) ** 2 },
                            angle: { value: c.angle ?? 0 },
                            strokeWidth: { value: c.width / dpr },
                            fill: { value: [0.8, 0.2, 0.1, 1] },
                            stroke: { value: [0.2, 0.5, 0.9, alpha] },
                            strokeOpacity: { value: 1 },
                        },
                    });
                    renderer.render({
                        items: [{ mark }],
                        clearColor: { r: 0, g: 0, b: 0, a: 0 },
                    });
                    const e = renderer.device.createCommandEncoder();
                    e.copyTextureToBuffer(
                        { texture: renderer.context.getCurrentTexture() },
                        { buffer, bytesPerRow: canvas.width * 4 },
                        { width: canvas.width, height: canvas.height }
                    );
                    renderer.device.queue.submit([e.finish()]);
                    await buffer.mapAsync(GPUMapMode.READ);
                    const bytes = new Uint8Array(
                        buffer.getMappedRange()
                    ).slice();
                    buffer.unmap();
                    renderer.destroyMark(mark.markId);
                    return bytes;
                }
                try {
                    const frames = new Map();
                    for (const c of cases) {
                        const rects = referencePolygons(c),
                            terms = [];
                        for (let mask = 1; mask < 2 ** rects.length; mask++) {
                            let poly = null,
                                count = 0;
                            for (let i = 0; i < rects.length; i++)
                                if (mask & (1 << i)) {
                                    count++;
                                    poly =
                                        poly === null
                                            ? rects[i]
                                            : clip(poly, rects[i]);
                                }
                            if (poly.length && area(poly) > 1e-12)
                                terms.push({ poly, sign: count % 2 ? 1 : -1 });
                        }
                        const pixels = await render(c),
                            fractional = await render(c, 0.5);
                        frames.set(c.name, pixels);
                        let maximum = 0,
                            overTwo = 0,
                            painted = 0,
                            opacityError = 0,
                            worst = null;
                        for (let py = 0; py < canvas.height; py++)
                            for (let px = 0; px < canvas.width; px++) {
                                const pixel = [
                                    [px, py],
                                    [px + 1, py],
                                    [px + 1, py + 1],
                                    [px, py + 1],
                                ];
                                const coverage = Math.max(
                                    0,
                                    Math.min(
                                        1,
                                        terms.reduce(
                                            (sum, t) =>
                                                sum +
                                                t.sign *
                                                    area(clip(t.poly, pixel)),
                                            0
                                        )
                                    )
                                );
                                const expected = [0.2, 0.5, 0.9, 1].map((v) =>
                                        Math.round(v * coverage * 255)
                                    ),
                                    j = (py * canvas.width + px) * 4;
                                const actual = Array.from(
                                        pixels.slice(j, j + 4)
                                    ),
                                    error = Math.max(
                                        ...actual.map((v, k) =>
                                            Math.abs(v - expected[k])
                                        )
                                    );
                                if (error > maximum) {
                                    maximum = error;
                                    worst = {
                                        px,
                                        py,
                                        actual,
                                        expected,
                                        coverage,
                                    };
                                }
                                overTwo += error > 2;
                                painted += coverage > 0;
                                for (let k = 0; k < 4; k++)
                                    opacityError = Math.max(
                                        opacityError,
                                        Math.abs(
                                            fractional[j + k] -
                                                Math.round(expected[k] * 0.5)
                                        )
                                    );
                            }
                        const centerPixel =
                            (Math.floor((c.y ?? 32 + 0.5 / dpr) * dpr) *
                                canvas.width +
                                Math.floor((c.x ?? 32 + 0.5 / dpr) * dpr)) *
                            4;
                        rows.push({
                            name: c.name,
                            segments: c.segments.length,
                            maximum,
                            overTwo,
                            painted,
                            opacityError,
                            worst,
                            centerAlpha: pixels[centerPixel + 3],
                            expectedCenter: c.expectedCenter ?? null,
                        });
                    }
                    const difference = (a, b) =>
                        a.reduce(
                            (m, v, i) => Math.max(m, Math.abs(v - b[i])),
                            0
                        );
                    const invariants = {
                        duplicate: difference(
                            frames.get("strip .1"),
                            frames.get("duplicate strip")
                        ),
                        reversal: difference(
                            frames.get("cross .19"),
                            frames.get("reversed directions")
                        ),
                        tripleOrder: difference(
                            frames.get("triple overlap"),
                            frames.get("triple overlap reordered")
                        ),
                        nearParallelOrder: difference(
                            frames.get("near parallel"),
                            frames.get("near parallel reordered")
                        ),
                        asymmetricDirectionOrder: difference(
                            frames.get("asymmetric"),
                            frames.get("asymmetric reversed")
                        ),
                    };
                    const validation = await renderer.device.popErrorScope();
                    return {
                        dpr,
                        rows,
                        invariants,
                        validation: validation?.message ?? null,
                    };
                } finally {
                    buffer.destroy();
                    renderer.destroy();
                }
            }, dpr);
            await writeFile(
                testInfo.outputPath("results.json"),
                JSON.stringify(result, null, 2)
            );
            console.log(JSON.stringify(result));
            expect(result.validation).toBeNull();
            for (const row of result.rows) {
                expect(row.painted).toBeGreaterThan(0);
                expect(row.maximum).toBeLessThanOrEqual(2);
                expect(row.opacityError).toBeLessThanOrEqual(2);
                if (row.expectedCenter !== null)
                    expect(
                        Math.abs(row.centerAlpha / 255 - row.expectedCenter)
                    ).toBeLessThanOrEqual(2 / 255);
            }
            for (const error of Object.values(result.invariants))
                expect(error).toBeLessThanOrEqual(2);
        }
    );
