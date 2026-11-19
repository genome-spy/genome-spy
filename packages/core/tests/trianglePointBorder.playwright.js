import { fileURLToPath, URL } from "node:url";
import { expect, test } from "playwright/test";

const coreSource = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));

for (const dpr of [1, 2]) {
    test(`WebGL draws and picks wide triangle borders at DPR ${dpr}`, async ({
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
            await page.route("**/triangle-border.html", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/triangle-border.html", baseURL).href);
            const { samples, pngSize, liveSize } = await page.evaluate(
                async ({ coreSource, dpr }) => {
                    const { embed } = await import(coreSource + "minimal.js");
                    await import(coreSource + "rendering/registerWebGL.js");
                    const api = await embed(
                        globalThis.document.body,
                        {
                            name: "points",
                            width: 256,
                            height: 128,
                            padding: 0,
                            config: {
                                background: null,
                                view: { stroke: null },
                            },
                            data: {
                                values: [
                                    { id: "upright", x: 64, angle: 0 },
                                    { id: "rotated", x: 192, angle: 89 },
                                ],
                            },
                            mark: {
                                type: "point",
                                shape: "triangle-up",
                                size: 784,
                                fill: "red",
                                stroke: "blue",
                                strokeWidth: 36,
                            },
                            encoding: {
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    scale: { domain: [0, 256], nice: false },
                                    axis: null,
                                },
                                y: { value: 0.5 },
                                angle: {
                                    field: "angle",
                                    type: "quantitative",
                                    scale: null,
                                },
                            },
                        },
                        {
                            renderer: "webgl",
                            onError: (error) => {
                                throw error;
                            },
                        }
                    );
                    try {
                        const { blob } = await api.imageExport.raster({
                            background: null,
                            pixelRatio: dpr,
                        });
                        const image = await globalThis.createImageBitmap(blob);
                        const canvas = new globalThis.OffscreenCanvas(
                            image.width,
                            image.height
                        );
                        const context = canvas.getContext("2d");
                        context.drawImage(image, 0, 0);
                        image.close();
                        const view = api.views.get({
                            scope: [],
                            view: "points",
                        });
                        const result = [];
                        // Sample just inside each border tip and beyond it.
                        for (const [x, y] of [
                            [64, 17],
                            [238, 63],
                            [64, 12],
                            [243, 63],
                        ]) {
                            const { data } = context.getImageData(
                                x * dpr,
                                y * dpr,
                                1,
                                1
                            );
                            const pick = await view.marks.pick({ x, y });
                            result.push({
                                rgba: Array.from(data),
                                picked:
                                    pick.status === "hit"
                                        ? pick.hit.datum.id
                                        : null,
                            });
                        }
                        const live =
                            globalThis.document.querySelector("canvas");
                        return {
                            samples: result,
                            pngSize: [canvas.width, canvas.height],
                            liveSize: [live.width, live.height],
                        };
                    } finally {
                        api.finalize();
                    }
                },
                { coreSource, dpr }
            );
            expect(pngSize).toEqual([256 * dpr, 128 * dpr]);
            expect(liveSize).toEqual(pngSize);
            for (const [index, id] of ["upright", "rotated"].entries()) {
                expect.soft(samples[index].picked, `${id} tip pick`).toBe(id);
                expect
                    .soft(samples[index].rgba.slice(0, 3), `${id} tip RGB`)
                    .toEqual([0, 0, 255]);
                expect
                    .soft(samples[index].rgba[3], `${id} tip alpha`)
                    .toBeGreaterThan(220);
            }
            for (const sample of samples.slice(2)) {
                expect(sample).toEqual({ rgba: [0, 0, 0, 0], picked: null });
            }
        } finally {
            await browser.close();
        }
    });
}
