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
