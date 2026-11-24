import { URL } from "node:url";
import { expect, test } from "playwright/test";

test("WebGL moves a rule with a parameter-only position expression", async ({
    playwright,
    baseURL,
}) => {
    const browser = await playwright.chromium.launch({
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    try {
        const page = await browser.newPage();
        await page.route("**/parameter-position.html", (route) =>
            route.fulfill({
                contentType: "text/html",
                body: "<body style='margin:0'></body>",
            })
        );
        await page.goto(new URL("/parameter-position.html", baseURL).href);

        const samples = await page.evaluate(async () => {
            const { embed } = await import("/index.js");
            const start = 2 ** 26;
            const api = await embed(
                globalThis.document.body,
                {
                    width: 128,
                    height: 40,
                    padding: 0,
                    config: { view: { stroke: null } },
                    params: [{ name: "position", value: start + 16 }],
                    data: { values: [{}] },
                    mark: { type: "rule", color: "red", size: 4 },
                    encoding: {
                        x: {
                            expr: "position",
                            type: "index",
                            axis: null,
                            scale: { domain: [start, start + 63], zoom: false },
                        },
                    },
                },
                { renderer: "webgl" }
            );
            try {
                const sample = async () => {
                    const { blob } = await api.imageExport.raster({
                        pixelRatio: 1,
                        background: null,
                    });
                    const bitmap = await globalThis.createImageBitmap(blob);
                    const ctx = new globalThis.OffscreenCanvas(
                        128,
                        40
                    ).getContext("2d");
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    return [33, 97].map((x) =>
                        Array.from(ctx.getImageData(x, 20, 1, 1).data)
                    );
                };

                const before = await sample();
                api.params.get("position").setValue(start + 48);
                return [before, await sample()];
            } finally {
                api.finalize();
            }
        });

        const red = [255, 0, 0, 255];
        const transparent = [0, 0, 0, 0];
        expect(samples).toEqual([
            [red, transparent],
            [transparent, red],
        ]);
    } finally {
        await browser.close();
    }
});
