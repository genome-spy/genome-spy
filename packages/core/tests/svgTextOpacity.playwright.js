import { fileURLToPath, URL } from "node:url";
import { expect, test } from "playwright/test";

const core = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));

test("SVG export fades overlapping glyphs once per label", async ({
    page,
    baseURL,
}) => {
    await page.route("**/svg-text-opacity", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<body></body>",
        })
    );
    await page.goto(new URL("/svg-text-opacity", baseURL).href);
    const result = await page.evaluate(async (core) => {
        const { embed } = await import(core + "minimal.js");
        await import(core + "rendering/registerCanvas.js");
        await import(core + "rendering/registerSvg.js");
        const api = await embed(
            globalThis.document.body,
            {
                width: 128,
                height: 96,
                padding: 0,
                config: {
                    background: null,
                    view: { stroke: null, strokeWidth: 0 },
                },
                params: [
                    { name: "alpha", value: 1 },
                    { name: "fillAlpha", value: 1 },
                    { name: "fade", value: 1 },
                ],
                opacity: { expr: "fade" },
                datasets: { labels: [{}] },
                data: { name: "labels" },
                mark: {
                    type: "text",
                    font: "Arial",
                    size: 48,
                    fill: "blue",
                    opacity: { expr: "alpha" },
                    fillOpacity: { expr: "fillAlpha" },
                },
                encoding: {
                    x: { value: 0.5 },
                    y: { value: 0.5 },
                    // U+0338 draws a slash across A as a separate overlapping glyph.
                    text: { value: "A\u0338" },
                },
            },
            { renderer: "canvas" }
        );
        /** @param {number} alpha @param {number} count @param {number} fade */
        async function capture(alpha, count, fade) {
            api.params.get("alpha").setValue(alpha);
            api.params.get("fade").setValue(fade);
            api.datasets.set(
                "labels",
                Array.from({ length: count }, () => ({}))
            );
            const { blob } = await api.imageExport.svg({ background: null });
            const svg = new globalThis.DOMParser().parseFromString(
                await blob.text(),
                "image/svg+xml"
            );
            if (!svg.querySelector("text") || svg.querySelector("image"))
                throw Error("Expected vector text export");
            const url = globalThis.URL.createObjectURL(blob);
            const image = new globalThis.Image();
            try {
                image.src = url;
                await image.decode();
                const canvas = globalThis.document.createElement("canvas");
                canvas.width = 128;
                canvas.height = 96;
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0);
                return Array.from(
                    context.getImageData(0, 0, 128, 96).data
                ).filter((_, index) => index % 4 === 3);
            } finally {
                globalThis.URL.revokeObjectURL(url);
            }
        }
        try {
            await api.awaitVisibleLazyData(
                globalThis.AbortSignal.timeout(10000)
            );
            const opaque = await capture(1, 1, 1);
            const faded = await capture(0.5, 1, 1);
            const paired = await capture(0.5, 2, 0.8);
            api.params.get("fillAlpha").setValue(0.4);
            const translucent = await capture(1, 1, 1);
            const translucentFade = await capture(0.5, 1, 1);
            /** @param {number[]} actual @param {(index: number) => number} expected */
            const error = (actual, expected) =>
                actual.reduce(
                    (maximum, alpha, index) =>
                        Math.max(maximum, Math.abs(alpha - expected(index))),
                    0
                );
            return {
                ink: opaque.filter((alpha) => alpha > 0).length,
                opaqueMaximum: Math.max(...opaque),
                paintMaximum: Math.max(...translucent),
                singleError: error(faded, (i) => opaque[i] * 0.5),
                pairError: error(
                    paired,
                    (i) => 255 * 0.8 * (1 - (1 - opaque[i] / 510) ** 2)
                ),
                paintError: error(translucentFade, (i) => translucent[i] * 0.5),
            };
        } finally {
            api.finalize();
        }
    }, core);
    expect(result.ink).toBeGreaterThan(100);
    expect(result.paintMaximum).toBeLessThan(result.opaqueMaximum);
    expect(result.singleError).toBeLessThanOrEqual(2);
    expect(result.pairError).toBeLessThanOrEqual(2);
    expect(result.paintError).toBeLessThanOrEqual(2);
});
