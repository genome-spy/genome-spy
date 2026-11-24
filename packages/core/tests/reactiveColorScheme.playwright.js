import { expect, test } from "playwright/test";

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
    test(`${renderer} recolors the plot and gradient legend when its scheme changes`, async ({
        page,
    }) => {
        await page.goto("/screenshot.html");
        const result = await page.evaluate(async (renderer) => {
            const { embed } = await import("/index.js");
            await import("/rendering/registerWebGL.js");
            const api = await embed(
                globalThis.document.body,
                {
                    width: 96,
                    height: 80,
                    padding: 0,
                    config: { legend: { disable: false } },
                    params: [{ name: "palette", value: "viridis" }],
                    scales: {
                        fill: {
                            domain: [0, 1],
                            scheme: {
                                name: { expr: "palette" },
                                extent: [0.2, 0.6],
                            },
                            reverse: true,
                        },
                    },
                    layer: [
                        {
                            name: "plot",
                            // The scheme must read the scale owner's parameter.
                            params: [{ name: "palette", value: "plasma" }],
                            data: { values: [{ score: 0.25 }] },
                            mark: "rect",
                            encoding: {
                                fill: {
                                    field: "score",
                                    type: "quantitative",
                                    legend: {
                                        orient: "right",
                                        gradientLength: 80,
                                    },
                                },
                            },
                        },
                    ],
                },
                { renderer }
            );
            try {
                const plot = api.debug
                    .getViewRoot()
                    .findDescendantByName("plot");
                const { x, y, x2, width, height } = plot.layoutCoords;
                const capture = async (expected) => {
                    const { blob } = await api.imageExport.raster({
                        pixelRatio: 1,
                    });
                    const image = await globalThis.createImageBitmap(blob);
                    const context = new globalThis.OffscreenCanvas(
                        image.width,
                        image.height
                    ).getContext("2d");
                    context.drawImage(image, 0, 0);
                    const mark = context.getImageData(
                        x + width / 2,
                        y + height / 2,
                        1,
                        1
                    ).data;
                    const legend = context.getImageData(
                        x2,
                        0,
                        image.width - x2,
                        image.height
                    ).data;
                    image.close();

                    const matches = (bytes, offset) =>
                        expected.every(
                            (value, i) =>
                                Math.abs(bytes[offset + i] - value) <= 3
                        );
                    for (let i = 0; i < legend.length; i += 4) {
                        if (matches(legend, i))
                            return { mark: matches(mark, 0), legend: true };
                    }
                    return { mark: matches(mark, 0), legend: false };
                };

                // The reversed extent maps score 0.25 to each palette's midpoint.
                const before = await capture([33, 145, 141]);
                api.params.get("palette").setValue("magma");
                return [before, await capture([182, 55, 122])];
            } finally {
                api.finalize();
            }
        }, renderer);

        expect(result).toEqual([
            { mark: true, legend: true },
            { mark: true, legend: true },
        ]);
    });
}
