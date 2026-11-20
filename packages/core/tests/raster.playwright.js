import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { expect, test } from "playwright/test";

const coreSource = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));

test("WebGPU raster maps cells and a row-backed rule onto the same locus axis", async ({
    playwright,
    baseURL,
}) => {
    const softwareWebGpu = process.platform === "linux";
    const browser = await playwright.chromium.launch({
        channel: "chrome",
        args: [
            "--enable-unsafe-webgpu",
            softwareWebGpu
                ? "--enable-features=Vulkan"
                : "--enable-features=WebGPU",
            "--ignore-gpu-blocklist",
            ...(softwareWebGpu
                ? [
                      "--use-angle=swiftshader",
                      "--enable-unsafe-swiftshader",
                      "--use-vulkan=swiftshader",
                      "--use-webgpu-adapter=swiftshader",
                      "--disable-vulkan-surface",
                  ]
                : process.platform === "darwin"
                  ? ["--use-angle=metal"]
                  : []),
        ],
    });
    try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        const browserErrors = [];
        page.on("console", (message) => {
            if (
                /WGSL|Invalid ShaderModule|Invalid RenderPipeline/.test(
                    message.text()
                )
            )
                browserErrors.push(message.text());
        });
        await page.route("**/raster-proof", (route) =>
            route.fulfill({
                contentType: "text/html",
                body: "<body style='margin:0'><div id='plot'></div></body>",
            })
        );
        await page.goto(new URL("/raster-proof", baseURL).href);
        const result = await page.evaluate(async (src) => {
            const { embed } = await import(src + "minimal.js");
            await import(src + "rendering/webgpu/register.js");
            const start = 2_000_000_001;
            const errors = [];
            const api = await embed(
                globalThis.document.querySelector("#plot"),
                {
                    assembly: "hg19",
                    width: 100,
                    height: 100,
                    padding: 0,
                    view: { stroke: null },
                    params: [{ name: "upper", value: 4 }],
                    resolve: { scale: { x: "shared", y: "shared" } },
                    scales: {
                        x: { type: "locus", domain: [start, start + 1] },
                        y: { type: "linear", domain: [0, 2], reverse: true },
                    },
                    layer: [
                        {
                            data: {
                                values: [
                                    {
                                        dimensions: {
                                            column: {
                                                origin: start,
                                                step: 1,
                                                count: 2,
                                            },
                                            row: {
                                                origin: 0,
                                                step: 1,
                                                count: 2,
                                            },
                                        },
                                        fields: { value: [0, 2, 4, 1] },
                                    },
                                ],
                            },
                            mark: "raster",
                            encoding: {
                                x: {
                                    dimension: "column",
                                    type: "locus",
                                    axis: null,
                                },
                                y: {
                                    dimension: "row",
                                    type: "quantitative",
                                    axis: null,
                                },
                                color: {
                                    field: "value",
                                    type: "quantitative",
                                    scale: {
                                        domain: [0, { expr: "upper" }],
                                        range: ["black", "red"],
                                    },
                                    legend: null,
                                },
                            },
                        },
                        {
                            data: { values: [{ pos: start + 1 }] },
                            mark: { type: "rule", color: "blue", size: 4 },
                            encoding: {
                                x: {
                                    field: "pos",
                                    type: "locus",
                                    band: 0,
                                    axis: null,
                                },
                            },
                        },
                    ],
                },
                {
                    renderer: "webgpu",
                    onError: (error) => errors.push(error.message),
                }
            );

            async function sample() {
                const { blob } = await api.imageExport.raster({
                    pixelRatio: 1,
                });
                const bitmap = await globalThis.createImageBitmap(blob);
                const canvas = globalThis.document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const context = canvas.getContext("2d", {
                    willReadFrequently: true,
                });
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                return [
                    [25, 25],
                    [75, 25],
                    [25, 75],
                    [75, 75],
                    [50, 25],
                ].map(([x, y]) =>
                    Array.from(context.getImageData(x, y, 1, 1).data).slice(
                        0,
                        3
                    )
                );
            }

            try {
                await api.awaitVisibleLazyData(
                    globalThis.AbortSignal.timeout(10000)
                );
                const before = await sample();
                api.params.get("upper").setValue(8);
                return { before, after: await sample(), errors };
            } finally {
                api.finalize();
            }
        }, coreSource);
        expect([...result.errors, ...browserErrors]).toEqual([]);
        expect(result.before).toEqual([
            [0, 0, 0],
            [128, 0, 0],
            [255, 0, 0],
            [64, 0, 0],
            [0, 0, 255],
        ]);
        expect(result.after[2]).toEqual([128, 0, 0]);
    } finally {
        await browser.close();
    }
});
