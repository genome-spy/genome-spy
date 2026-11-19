import process from "node:process";
import { URL } from "node:url";
import { expect, test } from "playwright/test";

for (const [renderer, dpr] of [
    ["canvas", 1],
    ["canvas", 2],
    ["webgl", 1],
]) {
    test(`${renderer} point border follows alignment at DPR ${dpr}`, async ({
        playwright,
        baseURL,
    }) => {
        const browser = await playwright.chromium.launch({
            args: [
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                `--force-device-scale-factor=${dpr}`,
            ],
        });
        try {
            const page = await browser.newPage({ deviceScaleFactor: dpr });
            await page.route("**/point-align.html", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/point-align.html", baseURL).href);
            const results = await page.evaluate(
                async ({ renderer, dpr }) => {
                    const { embed } = await import("/minimal.js");
                    if (renderer === "canvas")
                        await import("/rendering/registerCanvas.js");
                    else await import("/rendering/registerWebGL.js");
                    await import("/rendering/registerSvg.js");
                    const direct = (field, type) => ({
                        field,
                        type,
                        scale: null,
                    });
                    const shapes = [
                        "diamond",
                        "square",
                        "circle",
                        "triangle-left",
                    ];
                    const values = [
                        ["translucent", 30, 0.5, 256, 12, 0, "red"],
                        ["opaque", 70, 1, 256, 4, 45, "red"],
                        ["equal", 105, 1, 256, 4, 0, "rgba(255,0,0,0.75)"],
                        // The outside band enters the canvas even though the anchor is outside.
                        ["edge", 145, 0.5, 64, 8, 0, "red"],
                    ].map(([id, x, a, size, width, angle, fill], index) => ({
                        id,
                        x,
                        a,
                        size,
                        width,
                        angle,
                        fill,
                        shape: shapes[index],
                    }));
                    const api = await embed(
                        globalThis.document.body,
                        {
                            name: "points",
                            width: 128,
                            height: 64,
                            padding: 0,
                            params: [{ name: "align", value: "center" }],
                            config: {
                                background: null,
                                view: { stroke: null },
                                point: { strokeAlign: { expr: "align" } },
                            },
                            data: { values },
                            mark: {
                                type: "point",
                                stroke: "blue",
                                strokeOpacity: 0.75,
                                inwardStroke: true,
                                clip: false,
                                cullByVisibleRange: false,
                            },
                            encoding: {
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    scale: {
                                        domain: [0, 128],
                                        nice: false,
                                        zero: false,
                                    },
                                    axis: null,
                                },
                                y: { value: 0.5 },
                                shape: {
                                    field: "shape",
                                    type: "nominal",
                                    legend: null,
                                    scale: {
                                        domain: shapes,
                                        range: shapes,
                                    },
                                },
                                angle: direct("angle", "quantitative"),
                                size: direct("size", "quantitative"),
                                strokeWidth: direct("width", "quantitative"),
                                fillOpacity: direct("a", "quantitative"),
                                fill: {
                                    field: "fill",
                                    type: "nominal",
                                    scale: null,
                                },
                            },
                        },
                        {
                            renderer,
                            onError: (error) => {
                                throw error;
                            },
                        }
                    );
                    try {
                        const nextPaint = () =>
                            new Promise((resolve) =>
                                globalThis.requestAnimationFrame(() =>
                                    globalThis.requestAnimationFrame(resolve)
                                )
                            );
                        const live =
                            globalThis.document.querySelector("canvas");
                        const view = api.views.get({
                            scope: [],
                            view: "points",
                        });
                        const samples = (ctx) =>
                            [34, 50, 77, 84, 111, 115, 127].map((x) =>
                                Array.from(
                                    ctx.getImageData(x * dpr, 32 * dpr, 1, 1)
                                        .data
                                )
                            );
                        const decode = async (blob) => {
                            const url = globalThis.URL.createObjectURL(blob);
                            try {
                                const image = new globalThis.Image();
                                image.src = url;
                                await image.decode();
                                const target = new globalThis.OffscreenCanvas(
                                    128 * dpr,
                                    64 * dpr
                                );
                                const ctx = target.getContext("2d");
                                ctx.drawImage(
                                    image,
                                    0,
                                    0,
                                    target.width,
                                    target.height
                                );
                                return samples(ctx);
                            } finally {
                                globalThis.URL.revokeObjectURL(url);
                            }
                        };
                        const png = async () =>
                            decode(
                                (
                                    await api.imageExport.raster({
                                        background: null,
                                        pixelRatio: dpr,
                                    })
                                ).blob
                            );
                        const capture = async () => {
                            await nextPaint();
                            const pick = await view.marks.pick({
                                x: 50,
                                y: 32,
                            });
                            return {
                                live:
                                    renderer === "canvas"
                                        ? samples(live.getContext("2d"))
                                        : null,
                                png: await png(),
                                picked:
                                    pick.status === "hit"
                                        ? pick.hit.datum.id
                                        : null,
                            };
                        };
                        const center = await capture();
                        api.params.get("align").setValue("outside");
                        const outside = await capture();
                        const { blob } = await api.imageExport.svg({
                            background: null,
                        });
                        const svg = await decode(blob);
                        api.params.get("align").setValue("inside");
                        const inside = await capture();
                        return {
                            center,
                            inside,
                            outside,
                            svg,
                            liveSize: [live.width, live.height],
                        };
                    } finally {
                        api.finalize();
                    }
                },
                { renderer, dpr }
            );
            expect(results.liveSize).toEqual([128 * dpr, 64 * dpr]);
            expect(results.center.picked).toBeNull();
            expect(results.inside.picked).toBeNull();
            expect(results.inside.png[1]).toEqual([0, 0, 0, 0]);
            expect(results.outside.picked).toBe("translucent");
            for (const source of [
                results.center.png,
                results.center.live,
            ].filter(Boolean)) {
                expect(source[1]).toEqual([0, 0, 0, 0]);
            }
            for (const source of [
                results.outside.png,
                results.outside.live,
                results.svg,
            ].filter(Boolean)) {
                for (let i = 0; i < 6; i++) {
                    const expected =
                        i % 2
                            ? [0, 0, 255, 191]
                            : [255, 0, 0, [128, 255, 191][i / 2]];
                    for (const [j, value] of expected.entries()) {
                        expect(
                            Math.abs(source[i][j] - value),
                            JSON.stringify({ i, j, pixel: source[i], expected })
                        ).toBeLessThanOrEqual(3);
                    }
                }
                expect(source[6][2]).toBe(255);
                expect(source[6][3]).toBeGreaterThan(100);
            }
        } finally {
            await browser.close();
        }
    });
}

test("WebGPU aligns the supplied point path and keeps line symbols stable", async ({
    playwright,
    baseURL,
}) => {
    const browser = await playwright.chromium.launch({
        args: [
            "--enable-unsafe-webgpu",
            "--ignore-gpu-blocklist",
            ...(process.platform === "darwin"
                ? ["--use-angle=metal"]
                : [
                      "--use-angle=swiftshader",
                      "--enable-unsafe-swiftshader",
                      "--enable-features=Vulkan",
                      "--use-vulkan=swiftshader",
                      "--use-webgpu-adapter=swiftshader",
                      "--disable-vulkan-surface",
                  ]),
        ],
    });
    try {
        const page = await browser.newPage();
        await page.route("**/webgpu-point-align", (route) =>
            route.fulfill({
                contentType: "text/html",
                body: "<body style='margin:0'></body>",
            })
        );
        await page.goto(new URL("/webgpu-point-align", baseURL).href);
        const result = await page.evaluate(async () => {
            const { embed } = await import("/minimal.js");
            await import("/rendering/webgpu/register.js");
            const mark = {
                type: "point",
                size: 2304,
                fill: "red",
                stroke: "blue",
                strokeWidth: 4,
                inwardStroke: true,
            };
            const x = {
                field: "x",
                type: "quantitative",
                scale: { domain: [0, 240], nice: false, zero: false },
                axis: null,
            };
            const api = await embed(
                globalThis.document.body,
                {
                    width: 240,
                    height: 80,
                    padding: 0,
                    params: [{ name: "alignment", value: "inside" }],
                    config: {
                        background: null,
                        view: { stroke: null },
                        point: { strokeAlign: { expr: "alignment" } },
                    },
                    layer: [
                        {
                            data: { values: [{ x: 36 }] },
                            mark: { ...mark, shape: "circle" },
                            encoding: { x, y: { value: 0.5 } },
                        },
                        {
                            data: {
                                values: [
                                    { x: 99, shape: "M-.9-.6H.45V.6H-.9Z" },
                                    { x: 157, shape: "+" },
                                    { x: 209, shape: "x" },
                                ],
                            },
                            mark,
                            encoding: {
                                x,
                                y: { value: 0.5 },
                                shape: {
                                    field: "shape",
                                    type: "nominal",
                                    scale: null,
                                },
                            },
                        },
                    ],
                },
                {
                    renderer: "webgpu",
                    onError: (error) => {
                        throw error;
                    },
                }
            );
            try {
                const png = async () => {
                    const { blob } = await api.imageExport.raster({
                        background: null,
                        pixelRatio: 1,
                    });
                    const img = await globalThis.createImageBitmap(blob);
                    const ctx = new globalThis.OffscreenCanvas(
                        img.width,
                        img.height
                    ).getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    img.close();
                    return ctx;
                };
                const inside = await png();
                api.params.get("alignment").setValue("outside");
                const outside = await png();
                const scan = (ctx, start, end) => {
                    const { data } = ctx.getImageData(
                        start,
                        40,
                        end - start,
                        1
                    );
                    let right = start;
                    for (let x = 0; x < end - start; x++)
                        if (data[4 * x + 3] > 128) right = start + x;
                    return right;
                };
                const before = inside.getImageData(125, 4, 115, 72).data;
                const after = outside.getImageData(125, 4, 115, 72).data;
                return {
                    circle: [scan(inside, 36, 66), scan(outside, 36, 66)],
                    custom: [scan(inside, 99, 124), scan(outside, 99, 124)],
                    linePixels: before.some(
                        (value, index) => index % 4 === 3 && value > 128
                    ),
                    linesUnchanged: before.every(
                        (value, index) => value === after[index]
                    ),
                };
            } finally {
                api.finalize();
            }
        });
        expect(result.circle[1] - result.circle[0]).toBeGreaterThanOrEqual(3);
        expect(result.custom[1] - result.custom[0]).toBeGreaterThanOrEqual(2);
        // The supplied path's right side is much closer to the anchor than a circle's.
        expect(result.custom[1] - 99).toBeLessThan(result.circle[1] - 36);
        expect(result.linePixels).toBe(true);
        expect(result.linesUnchanged).toBe(true);
    } finally {
        await browser.close();
    }
});
