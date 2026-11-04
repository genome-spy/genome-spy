import { fileURLToPath, URL } from "node:url";
import { expect, test } from "@playwright/test";

const coreSource =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));

for (const dpr of [1, 2]) {
    test(`Canvas opaque rectangle coverage at DPR ${dpr}`, async ({
        playwright,
        baseURL,
    }) => {
        const browser = await playwright.chromium.launch({
            args: [`--force-device-scale-factor=${dpr}`],
        });
        const page = await browser.newPage({ deviceScaleFactor: dpr });
        try {
            await page.route("**/canvas-rect-proof", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/canvas-rect-proof", baseURL).href);
            const result = await page.evaluate(verifyCanvasRect, {
                coreSource,
                dpr,
            });
            expect(result.backing).toEqual([64 * dpr, 64 * dpr]);
            expect(result.maxError).toBeLessThanOrEqual(2);
            expect(result.solidMinimum).toBe(255);
            for (const colors of result.nativeColors) {
                for (const [i, expected] of [
                    [0, [255, 0, 0, 128]],
                    [1, [0, 0, 255, 128]],
                    [2, [255, 0, 0, 255]],
                    [3, [255, 0, 0, 128]],
                ]) {
                    colors[i].forEach((value, channel) =>
                        expect(
                            Math.abs(value - expected[channel])
                        ).toBeLessThanOrEqual(1)
                    );
                }
            }
            expect(result.bordered).toEqual(result.reference);
            expect(
                result.reference.some((pixel) => pixel[3] > 0 && pixel[3] < 255)
            ).toBe(true);
        } finally {
            await browser.close();
        }
    });
}

/** @param {{coreSource: string, dpr: number}} options */
async function verifyCanvasRect({ coreSource, dpr }) {
    const { embed } = await import(coreSource + "minimal.js");
    await import(coreSource + "rendering/registerCanvas.js");
    await import(coreSource + "rendering/registerSvg.js");
    const position = (field) => ({
        field,
        type: "quantitative",
        scale: {
            domain: [0, 64],
            nice: false,
            zero: false,
        },
        axis: null,
    });
    const paint = (field) => ({
        field,
        type: "nominal",
        scale: null,
        legend: null,
    });
    const unit = {
        name: "rect",
        width: 64,
        height: 64,
        data: { name: "rows" },
        mark: {
            type: "rect",
            clip: true,
            minWidth: 0,
            minHeight: 0,
        },
        encoding: {
            x: position("x"),
            x2: { field: "x2" },
            y: position("y"),
            y2: { field: "y2" },
            fill: paint("fill"),
            stroke: paint("stroke"),
            strokeWidth: {
                field: "border",
                type: "quantitative",
                scale: null,
            },
        },
    };
    const host = globalThis.document.createElement("div");
    globalThis.document.body.append(host);
    const api = await embed(
        host,
        {
            ...unit,
            padding: 0,
            config: { background: null },
            datasets: { rows: [] },
        },
        { renderer: "canvas" }
    );
    const canvas = host.querySelector("canvas");
    const frames = async (api, canvas) => {
        await new Promise((resolve) =>
            globalThis.requestAnimationFrame(() =>
                globalThis.requestAnimationFrame(resolve)
            )
        );
        const read = () =>
            Array.from(
                canvas
                    .getContext("2d")
                    .getImageData(0, 0, canvas.width, canvas.height).data
            );
        const live = read();
        const target = new globalThis.OffscreenCanvas(
            canvas.width,
            canvas.height
        );
        const ctx = target.getContext("2d");
        const exports = [
            await api.imageExport.raster({
                pixelRatio: dpr,
                background: null,
            }),
            await api.imageExport.svg({
                background: null,
                rasterization: {
                    maxVectorInstances: 0,
                    pixelRatio: dpr,
                },
            }),
        ];
        const pixels = [live];
        for (const exported of exports) {
            const image = new globalThis.Image();
            const url = URL.createObjectURL(exported.blob);
            image.src = url;
            await image.decode();
            ctx.clearRect(0, 0, target.width, target.height);
            ctx.drawImage(image, 0, 0, target.width, target.height);
            pixels.push(
                Array.from(
                    ctx.getImageData(0, 0, target.width, target.height).data
                )
            );
            URL.revokeObjectURL(url);
        }
        return pixels;
    };
    const row = (
        x,
        top,
        width,
        height,
        border,
        fill = "red",
        stroke = "blue"
    ) => ({
        x,
        x2: x + width,
        y: 64 - top,
        y2: 64 - top - height,
        border,
        fill,
        stroke,
    });
    const area = (pixel, start, length) =>
        Math.max(
            0,
            Math.min((pixel + 1) / dpr, start + length) -
                Math.max(pixel / dpr, start)
        ) * dpr;
    let maxError = 0,
        solidMinimum = 255;
    try {
        // One-pixel borders and collapsed interiors protect distinct contour cases.
        for (const [width, height, border] of [
            [24, 20, 1 / dpr],
            [3 / dpr, 2 / dpr, 4 / dpr],
        ]) {
            const left = 12 + 0.25 / dpr,
                top = 14 + 0.375 / dpr;
            api.datasets.set("rows", [row(left, top, width, height, border)]);
            for (const pixels of await frames(api, canvas)) {
                for (let y = 0; y < canvas.height; y++)
                    for (let x = 0; x < canvas.width; x++) {
                        const outer =
                            area(x, left - border / 2, width + border) *
                            area(y, top - border / 2, height + border);
                        const inner =
                            area(
                                x,
                                left + border / 2,
                                Math.max(0, width - border)
                            ) *
                            area(
                                y,
                                top + border / 2,
                                Math.max(0, height - border)
                            );
                        const expected = [
                            inner * 255,
                            0,
                            (outer - inner) * 255,
                            outer * 255,
                        ];
                        const index = (y * canvas.width + x) * 4;
                        if (outer === 1)
                            solidMinimum = Math.min(
                                solidMinimum,
                                pixels[index + 3]
                            );
                        for (let channel = 0; channel < 4; channel++) {
                            const actual =
                                channel < 3
                                    ? (pixels[index + channel] *
                                          pixels[index + 3]) /
                                      255
                                    : pixels[index + channel];
                            maxError = Math.max(
                                maxError,
                                Math.abs(actual - expected[channel])
                            );
                        }
                    }
            }
        }
        // Reuse native styles after an eligible collapsed rectangle, including CSS
        // syntax that Canvas accepts but the GPU color parser does not.
        api.datasets.set("rows", [
            row(4, 4, 2, 2, 4),
            row(16, 16, 12, 12, 2, "rgb(255 0 0 / .5)"),
            row(40, 16, 12, 12, 2, "red", "rgb(0 0 255 / .5)"),
            row(16, 40, 12, 12, 2),
            row(40, 40, 12, 12, 2, "rgb(255 0 0 / .5)"),
        ]);
        const sample = (pixels, x, y, width = canvas.width) =>
            pixels.slice(
                (Math.floor(y * dpr) * width + Math.floor(x * dpr)) * 4,
                (Math.floor(y * dpr) * width + Math.floor(x * dpr)) * 4 + 4
            );
        const nativeColors = (await frames(api, canvas)).map((pixels) => [
            sample(pixels, 22, 22),
            sample(pixels, 39, 22),
            sample(pixels, 22, 46),
            sample(pixels, 46, 46),
        ]);
        api.finalize();
        host.replaceChildren();
        // Fractional padding makes a genuine fractional clip. In the body strip,
        // adding a border must not repaint the antialiased clip with blue.
        const clipped = await embed(
            host,
            {
                padding: {
                    left: 0.25,
                    right: 0.75,
                    top: 0.25,
                    bottom: 0.75,
                },
                spacing: 0,
                config: { background: null },
                datasets: {
                    rows: [row(-8, 8, 40, 40, 2 / dpr)],
                },
                hconcat: [
                    {
                        width: 8.25,
                        height: 64,
                        data: { values: [] },
                        mark: "rect",
                    },
                    { ...unit, width: 63.75 },
                ],
            },
            { renderer: "canvas" }
        );
        try {
            const c = host.querySelector("canvas");
            const bounds = clipped.views.getLayoutBounds(
                clipped.views.get({ scope: [], view: "rect" })
            );
            const edge = (pixels) =>
                sample(pixels, bounds.x, bounds.y + 24, c.width);
            const bordered = (await frames(clipped, c)).map(edge);
            clipped.datasets.set("rows", [row(-8, 8, 40, 40, 0)]);
            const reference = (await frames(clipped, c)).map(edge);
            return {
                backing: [canvas.width, canvas.height],
                maxError,
                solidMinimum,
                nativeColors,
                bordered,
                reference,
            };
        } finally {
            clipped.finalize();
        }
    } finally {
        api.finalize();
        host.remove();
    }
}
