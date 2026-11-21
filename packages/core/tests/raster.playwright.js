import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { expect, test } from "playwright/test";

const coreSource = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));

for (const renderer of /** @type {const} */ (["webgpu", "canvas"])) {
    test(`${renderer} raster maps cells and a row-backed rule onto the same locus axis`, ({
        playwright,
        baseURL,
    }) => checkRasterGrid(playwright, baseURL, renderer));
    test(`${renderer} raster strips use index edges, band placement, and tile opacity`, ({
        playwright,
        baseURL,
    }) => checkRasterStrips(playwright, baseURL, renderer));
}

test("Canvas recolors clipped raster tiles when the viewport log domain changes", async ({
    page,
}) => {
    await page.route("**/raster-log", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<body style='margin:0'></body>",
        })
    );
    await page.goto("/raster-log");
    const result = await page.evaluate(async (src) => {
        const { embed } = await import(src + "minimal.js");
        await import(src + "rendering/registerCanvas.js");
        const api = await embed(
            globalThis.document.body,
            {
                width: 100,
                height: 100,
                padding: 0,
                config: { background: null },
                view: { stroke: null },
                data: {
                    values: [
                        {
                            dimensions: {
                                column: { origin: 0, step: 1, count: 5 },
                                row: { origin: 0, step: 1, count: 1 },
                            },
                            fields: { value: [0, 1, 10, 100, null] },
                        },
                    ],
                },
                mark: { type: "raster", clip: true },
                encoding: {
                    x: {
                        dimension: "column",
                        type: "quantitative",
                        axis: null,
                        scale: { domain: [0, 5], zoom: true },
                    },
                    y: { dimension: "row", type: "quantitative", axis: null },
                    color: {
                        field: "value",
                        type: "quantitative",
                        legend: null,
                        scale: {
                            type: "log",
                            domain: { source: "viewport" },
                            range: ["black", "red"],
                            clamp: true,
                        },
                    },
                },
            },
            { renderer: "canvas" }
        );
        const view = api.debug
            .getViewRoot()
            .getDescendants()
            .find((candidate) => candidate.mark?.getType() === "raster");
        const x = view.getScaleResolution("x");
        const color = view.getScaleResolution("color");

        async function sample() {
            const { blob } = await api.imageExport.raster({
                pixelRatio: 1,
                background: null,
            });
            const bitmap = await globalThis.createImageBitmap(blob);
            const context = new globalThis.OffscreenCanvas(
                bitmap.width,
                bitmap.height
            ).getContext("2d");
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            return {
                domain: color.getDomain().map(Math.round),
                pixels: [10, 50, 90].map((column) =>
                    Array.from(context.getImageData(column, 50, 1, 1).data)
                ),
            };
        }
        try {
            const before = await sample();
            const domainUpdated = new Promise((resolve) => {
                const onDomain = () => {
                    if (Math.abs(color.getDomain().at(-1) - 10) < 1e-6) {
                        color.removeEventListener("domain", onDomain);
                        resolve(undefined);
                    }
                };
                color.addEventListener("domain", onDomain);
            });
            await x.zoomTo([0.5, 2.9]);
            await domainUpdated;
            return { before, after: await sample() };
        } finally {
            api.finalize();
        }
    }, coreSource);
    const black = [0, 0, 0, 255];
    expect(result).toEqual({
        before: {
            domain: [1, 100],
            pixels: [black, [128, 0, 0, 255], [0, 0, 0, 0]],
        },
        after: {
            domain: [1, 10],
            pixels: [black, black, [255, 0, 0, 255]],
        },
    });
});

/** @typedef {import("playwright/test").PlaywrightTestArgs["playwright"]} Playwright */

/** @param {Playwright} playwright @param {string} baseURL @param {"webgpu" | "canvas"} renderer */
async function checkRasterGrid(playwright, baseURL, renderer) {
    const setup = {
        src: coreSource,
        renderer,
        register:
            renderer === "canvas"
                ? "rendering/registerCanvas.js"
                : "rendering/webgpu/register.js",
    };
    const browser = await launchRasterBrowser(playwright, renderer);
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
        const result = await page.evaluate(async (args) => {
            const { src, renderer, register } = args;
            const { embed } = await import(src + "minimal.js");
            await import(src + register);
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
                        y: {
                            type: "linear",
                            domain: [0, 2],
                            reverse: true,
                        },
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
                    renderer,
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
        }, setup);
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
}

/** @param {Playwright} playwright @param {string} baseURL @param {"webgpu" | "canvas"} renderer */
async function checkRasterStrips(playwright, baseURL, renderer) {
    const setup = {
        src: coreSource,
        renderer,
        register:
            renderer === "canvas"
                ? "rendering/registerCanvas.js"
                : "rendering/webgpu/register.js",
    };
    const browser = await launchRasterBrowser(playwright, renderer);
    try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        const errors = [];
        page.on("console", (message) => {
            if (
                /WGSL|Invalid ShaderModule|Invalid RenderPipeline/.test(
                    message.text()
                )
            ) {
                errors.push(message.text());
            }
        });
        await page.route("**/raster-strips", (route) =>
            route.fulfill({
                contentType: "text/html",
                body: "<body style='margin:0'></body>",
            })
        );
        await page.goto(new URL("/raster-strips", baseURL).href);
        const results = await page.evaluate(async (args) => {
            const { src, renderer, register } = args;
            const { embed } = await import(src + "minimal.js");
            await import(src + register);

            async function render(reverse) {
                const host = globalThis.document.createElement("div");
                globalThis.document.body.append(host);
                const api = await embed(
                    host,
                    {
                        width: 80,
                        height: 60,
                        padding: 0,
                        config: { background: null },
                        view: { stroke: null },
                        params: [
                            {
                                name: "highlight",
                                select: { type: "point", encodings: ["y"] },
                                value: [{ y: "a" }],
                            },
                        ],
                        data: {
                            values: ["AG?-", "-?GA"].map((sequence, row) => ({
                                id: row ? "b" : "a",
                                dimensions: {
                                    column: {
                                        origin: 9,
                                        step: 2,
                                        count: 4,
                                    },
                                },
                                fields: { base: sequence },
                            })),
                        },
                        mark: "raster",
                        encoding: {
                            x: {
                                dimension: "column",
                                type: "index",
                                axis: null,
                                scale: {
                                    reverse,
                                    zoom: { extent: "data" },
                                },
                            },
                            y: {
                                field: "id",
                                type: "nominal",
                                axis: null,
                                scale: {
                                    type: "band",
                                    domain: ["a", "b"],
                                    paddingInner: 0.4,
                                },
                            },
                            color: {
                                field: "base",
                                type: "nominal",
                                legend: null,
                                scale: {
                                    type: "ordinal",
                                    domain: ["A", "G", "-"],
                                    range: ["red", "blue", "gray"],
                                },
                            },
                            opacity: {
                                condition: { param: "highlight", value: 1 },
                                value: 0.5,
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
                    const view = api.debug
                        .getViewRoot()
                        .getDescendants()
                        .find(
                            (candidate) =>
                                candidate.mark?.getType() === "raster"
                        );
                    const x = view.getScaleResolution("x");
                    const { blob } = await api.imageExport.raster({
                        pixelRatio: 1,
                        background: null,
                    });
                    const bitmap = await globalThis.createImageBitmap(blob);
                    const context = new globalThis.OffscreenCanvas(
                        bitmap.width,
                        bitmap.height
                    ).getContext("2d");
                    context.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    return {
                        extent: x.zoomExtent,
                        pixels: [
                            [1, 12],
                            [21, 12],
                            [41, 12],
                            [79, 12],
                            [10, 30],
                            [1, 48],
                            [79, 48],
                        ].map(([column, row]) =>
                            Array.from(
                                context.getImageData(column, row, 1, 1).data
                            )
                        ),
                    };
                } finally {
                    api.finalize();
                    host.remove();
                }
            }

            return [await render(false), await render(true)];
        }, setup);
        expect(errors).toEqual([]);
        const red = [255, 0, 0, 255];
        const blue = [0, 0, 255, 255];
        const gray = [128, 128, 128, 255];
        const fadedRed = [255, 0, 0, 128];
        const fadedGray = [128, 128, 128, 128];
        const clear = [0, 0, 0, 0];
        expect(results).toEqual([
            {
                extent: [9, 17],
                pixels: [red, blue, clear, gray, clear, fadedGray, fadedRed],
            },
            {
                extent: [9, 17],
                pixels: [gray, clear, blue, red, clear, fadedRed, fadedGray],
            },
        ]);
    } finally {
        await browser.close();
    }
}

/** @param {Playwright} playwright @param {"webgpu" | "canvas"} renderer */
function launchRasterBrowser(playwright, renderer) {
    if (renderer === "canvas")
        return playwright.chromium.launch({ channel: "chrome" });
    const softwareWebGpu = process.platform === "linux";
    return playwright.chromium.launch({
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
}
