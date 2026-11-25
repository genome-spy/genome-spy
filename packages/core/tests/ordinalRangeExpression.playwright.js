import { expect, test } from "playwright/test";

const colors = { red: 0xff0000, green: 0x00ff00, blue: 0x0000ff };

test.use({
    launchOptions: {
        args: [
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--enable-unsafe-webgpu",
            "--use-webgpu-adapter=swiftshader",
        ],
    },
});

for (const renderer of ["webgl", "webgpu"]) {
    test(`${renderer} updates shared ordinal marks and legend from a palette expression`, async ({
        page,
    }) => {
        await page.goto("/screenshot.html");
        const result = await page.evaluate(
            async ({ renderer, colors }) => {
                const { embed } = await import("/index.js");
                await import("/rendering/registerWebGL.js");
                const api = await embed(
                    globalThis.document.body,
                    {
                        padding: 0,
                        config: { legend: { disable: false } },
                        params: [
                            { name: "labels", value: ["a", "b"] },
                            { name: "palette", value: ["#ff0000"] },
                        ],
                        resolve: { scale: { fill: "shared" } },
                        vconcat: ["a", "b"].map((state) => ({
                            name: state,
                            width: 96,
                            height: 40,
                            // The shared scale must read the owner's palette.
                            params: [{ name: "palette", value: ["#ff00ff"] }],
                            data: { values: [{ state }] },
                            mark: "rect",
                            encoding: {
                                fill: {
                                    field: "state",
                                    type: "nominal",
                                    scale: {
                                        domain: { expr: "labels" },
                                        range: { expr: "palette" },
                                    },
                                },
                            },
                        })),
                    },
                    { renderer }
                );
                try {
                    const root = api.debug.getViewRoot();
                    const plots = ["a", "b"].map(
                        (name) => root.findDescendantByName(name).layoutCoords
                    );
                    const rgb = (r, g, b) => (r << 16) | (g << 8) | b;
                    const paletteColors = new Set(Object.values(colors));
                    const capture = async () => {
                        const { blob } = await api.imageExport.raster({
                            pixelRatio: 1,
                        });
                        const image = await globalThis.createImageBitmap(blob);
                        const { width, height } = image;
                        const context = new globalThis.OffscreenCanvas(
                            width,
                            height
                        ).getContext("2d");
                        context.drawImage(image, 0, 0);
                        image.close();
                        const marks = plots.map(({ x, y, width, height }) =>
                            rgb(
                                ...context.getImageData(
                                    Math.floor(x + width / 2),
                                    Math.floor(y + height / 2),
                                    1,
                                    1
                                ).data
                            )
                        );
                        const legendX = Math.ceil(
                            Math.max(...plots.map(({ x2 }) => x2))
                        );
                        const pixels = context.getImageData(
                            legendX,
                            0,
                            width - legendX,
                            height
                        ).data;
                        const legend = new Set();
                        for (let i = 0; i < pixels.length; i += 4) {
                            const color = rgb(
                                pixels[i],
                                pixels[i + 1],
                                pixels[i + 2]
                            );
                            if (paletteColors.has(color)) legend.add(color);
                        }
                        return { marks, legend: [...legend] };
                    };
                    const before = await capture();
                    api.params.get("palette").setValue(["#00ff00", "#0000ff"]);
                    return { before, after: await capture() };
                } finally {
                    api.finalize();
                }
            },
            { renderer, colors }
        );

        expect(result).toEqual({
            before: {
                marks: [colors.red, colors.red],
                legend: [colors.red],
            },
            after: {
                marks: [colors.green, colors.blue],
                legend: [colors.green, colors.blue],
            },
        });
    });
}
