import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { expect, test } from "@playwright/test";

const core =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));
for (const renderer of ["canvas", "webgl", "webgpu"])
    for (const dpr of [1, 2]) {
        test(`${renderer} SVG view opacity at DPR ${dpr}`, async ({
            playwright,
            baseURL,
        }) => {
            const browser = await playwright.chromium.launch({
                args: [
                    "--enable-unsafe-webgpu",
                    "--ignore-gpu-blocklist",
                    `--force-device-scale-factor=${dpr}`,
                    ...(process.platform === "darwin"
                        ? ["--use-angle=metal"]
                        : [
                              "--use-angle=swiftshader",
                              "--enable-unsafe-swiftshader",
                              ...(renderer === "webgpu"
                                  ? [
                                        "--enable-features=Vulkan",
                                        "--use-vulkan=swiftshader",
                                        "--use-webgpu-adapter=swiftshader",
                                        "--disable-vulkan-surface",
                                    ]
                                  : []),
                          ]),
                ],
            });
            try {
                const page = await browser.newPage({ deviceScaleFactor: dpr });
                const errors = [];
                page.on("pageerror", (error) => errors.push(error.message));
                await page.route("**/svg-opacity", (route) =>
                    route.fulfill({
                        contentType: "text/html",
                        body: "<body></body>",
                    })
                );
                await page.goto(new URL("/svg-opacity", baseURL).href);
                const result = await page.evaluate(checkExports, {
                    core,
                    renderer,
                    dpr,
                });
                expect(result.vectorImages).toBe(0);
                expect(result.hybridImages).toBe(2);
                expect(result.allRasterImages).toBe(2);
                expect(result.clips).toBeGreaterThan(0);
                expect(result.mismatches).toEqual([]);
                expect(result.hidden).toBe(true);
                expect(result.restored).toBe(true);
                expect(result.pngUnchanged).toBe(true);
                expect(result.pngInk).toBeGreaterThan(50);
                expect(errors).toEqual([]);
            } finally {
                await browser.close();
            }
        });
    }

/** @param {{core: string, renderer: string, dpr: number}} options */
async function checkExports({ core, renderer, dpr }) {
    const { embed } = await import(core + "minimal.js");
    await import(core + "rendering/registerSvg.js");
    await import(
        core +
            (renderer === "webgpu"
                ? "rendering/webgpu/register.js"
                : renderer === "webgl"
                  ? "rendering/registerWebGL.js"
                  : "rendering/registerCanvas.js")
    );
    const api = await embed(
        globalThis.document.body,
        {
            name: "outer",
            width: 128,
            height: 96,
            padding: 0,
            config: {
                background: null,
                view: { stroke: null, strokeWidth: 0 },
            },
            params: [{ name: "fade", value: 0.5 }],
            opacity: { expr: "fade" },
            spacing: 0,
            hconcat: [
                {
                    width: 64,
                    height: 96,
                    name: "nested",
                    opacity: 0.5,
                    layer: [
                        {
                            name: "rectangles",
                            data: {
                                values: [
                                    { x: 0.1, x2: 0.8 },
                                    { x: 0.2, x2: 0.9 },
                                    { x: 0.9, x2: 1.3 },
                                ],
                            },
                            mark: { type: "rect", color: "red", clip: true },
                            encoding: {
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    scale: null,
                                    axis: null,
                                },
                                x2: { field: "x2" },
                                y: { value: 0.1 },
                                y2: { value: 0.55 },
                            },
                        },
                        {
                            name: "rule",
                            data: { values: [{}] },
                            mark: {
                                type: "rule",
                                color: "blue",
                                size: 8,
                                clip: true,
                            },
                            encoding: {
                                x: { value: 0.5 },
                                y: { value: 0.1 },
                                y2: { value: 0.55 },
                            },
                        },
                    ],
                },
                {
                    width: 64,
                    height: 96,
                    name: "sibling",
                    opacity: 0.75,
                    data: {
                        values: [
                            { x: 0.25, alpha: 0.4 },
                            { x: 0.75, alpha: 0.4 },
                        ],
                    },
                    mark: {
                        type: "point",
                        shape: "square",
                        fill: "lime",
                        stroke: "blue",
                        strokeWidth: 2,
                        size: 256,
                        opacity: 0.6,
                    },
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: null,
                            axis: null,
                        },
                        y: { value: 0.8 },
                        fillOpacity: {
                            field: "alpha",
                            type: "quantitative",
                            scale: null,
                        },
                        strokeOpacity: { value: 0.8 },
                    },
                },
            ],
        },
        {
            renderer,
            onError: (error) => {
                throw error;
            },
        }
    );
    try {
        await api.awaitVisibleLazyData(globalThis.AbortSignal.timeout(10000));
        /** @param {number | undefined} threshold */
        const exportSvg = async (threshold) => {
            const result = await api.imageExport.svg({
                background: null,
                ...(threshold === undefined
                    ? {}
                    : {
                          rasterization: {
                              maxVectorInstances: threshold,
                              pixelRatio: dpr,
                          },
                      }),
            });
            if (result.warnings.length) throw Error(result.warnings.join("\n"));
            const text = await result.blob.text();
            return {
                document: new globalThis.DOMParser().parseFromString(
                    text,
                    "image/svg+xml"
                ),
                pixels: await rasterize(result.blob),
            };
        };
        /** @param {Blob} blob */
        async function rasterize(blob) {
            const url = globalThis.URL.createObjectURL(blob);
            const image = new globalThis.Image();
            try {
                image.src = url;
                await image.decode();
                const canvas = globalThis.document.createElement("canvas");
                canvas.width = 128 * dpr;
                canvas.height = 96 * dpr;
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                return Array.from(
                    context.getImageData(0, 0, canvas.width, canvas.height).data
                );
            } finally {
                globalThis.URL.revokeObjectURL(url);
            }
        }
        const capturePng = async () =>
            rasterize(
                (
                    await api.imageExport.raster({
                        background: null,
                        pixelRatio: dpr,
                    })
                ).blob
            );
        const pngBefore = await capturePng();
        const vector = await exportSvg(undefined),
            hybrid = await exportSvg(1),
            allRaster = await exportSvg(0);
        // Probe paint interiors, not backend-specific edge antialiasing. Expected alpha
        // is independent of the exporter: nested view factors multiply after overlap.
        const rect = vector.document.querySelector(
            '[data-mark-type="rect"] rect'
        );
        const rectY =
            +rect.getAttribute("y") + +rect.getAttribute("height") / 2;
        const square = vector.document.querySelector(
            '[data-mark-type="point"] rect'
        );
        const probes = [
            [64 * 0.15, rectY, [255, 0, 0, 64]],
            [24, rectY, [255, 0, 0, 64]],
            [32, rectY, [0, 0, 255, 64]],
            [70, rectY, [0, 0, 0, 0]],
            [
                +square.getAttribute("x") + +square.getAttribute("width") / 2,
                +square.getAttribute("y") + +square.getAttribute("height") / 2,
                [0, 255, 0, 38],
            ],
        ];
        const mismatches = [];
        for (const [mode, result] of [
            ["vector", vector],
            ["hybrid", hybrid],
            ["all-raster", allRaster],
        ])
            for (const [x, y, rgba] of probes) {
                const offset =
                    (Math.floor(y * dpr) * 128 * dpr + Math.floor(x * dpr)) * 4;
                const actual = result.pixels.slice(offset, offset + 4);
                if (
                    actual.length !== 4 ||
                    actual.some((value, c) => Math.abs(value - rgba[c]) > 2)
                )
                    mismatches.push({ mode, x, y, expected: rgba, actual });
            }
        api.params.get("fade").setValue(0);
        const hidden = (await exportSvg(0)).pixels.every(
            (value) => value === 0
        );
        api.params.get("fade").setValue(0.5);
        const restored = (await exportSvg(1)).pixels.every(
            (value, i) => value === hybrid.pixels[i]
        );
        const pngUnchanged = (await capturePng()).every(
            (value, i) => value === pngBefore[i]
        );
        const pngInk = pngBefore.filter(
            (value, i) => i % 4 === 3 && value > 0
        ).length;
        return {
            pngUnchanged,
            pngInk,
            vectorImages: vector.document.querySelectorAll("image").length,
            hybridImages: hybrid.document.querySelectorAll("image").length,
            allRasterImages:
                allRaster.document.querySelectorAll("image").length,
            clips: vector.document.querySelectorAll("clipPath").length,
            mismatches,
            hidden,
            restored,
        };
    } finally {
        api.finalize();
    }
}
