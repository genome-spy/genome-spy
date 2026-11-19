import { fileURLToPath, URL } from "node:url";
import { platform } from "node:os";
import { expect, test } from "playwright/test";

const core = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const clear = [0, 0, 0, 0];

for (const renderer of ["canvas", "webgl", "webgpu"]) {
    for (const dpr of [1, 2]) {
        test(`${renderer} aligns rectangle borders at DPR ${dpr}`, async ({
            playwright,
            baseURL,
        }) => {
            const browser = await playwright.chromium.launch({
                args: [
                    renderer === "webgpu" && platform() === "darwin"
                        ? "--use-angle=metal"
                        : "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader",
                    "--enable-unsafe-webgpu",
                    "--ignore-gpu-blocklist",
                    ...(renderer === "webgpu" && platform() === "linux"
                        ? [
                              "--enable-features=Vulkan",
                              "--use-vulkan=swiftshader",
                              "--use-webgpu-adapter=swiftshader",
                              "--disable-vulkan-surface",
                          ]
                        : []),
                    `--force-device-scale-factor=${dpr}`,
                ],
            });
            try {
                const page = await browser.newPage({ deviceScaleFactor: dpr });
                await page.route("**/rect-alignment", (route) =>
                    route.fulfill({
                        contentType: "text/html",
                        body: "<body style='margin:0'></body>",
                    })
                );
                await page.goto(new URL("/rect-alignment", baseURL).href);
                const result = await page.evaluate(
                    async ({ core, renderer, dpr }) => {
                        const { embed } = await import(core + "minimal.js");
                        await import(
                            core +
                                {
                                    canvas: "rendering/registerCanvas.js",
                                    webgl: "rendering/registerWebGL.js",
                                    webgpu: "rendering/webgpu/register.js",
                                }[renderer]
                        );
                        await import(core + "rendering/registerSvg.js");

                        const row = {
                            id: "rect",
                            x: 0.25,
                            x2: 0.75,
                            y: 0.25,
                            y2: 0.75,
                        };
                        const position = (field) => ({
                            field,
                            type: "quantitative",
                            axis: null,
                            scale: { domain: [0, 1], nice: false, zero: false },
                        });
                        const api = await embed(
                            globalThis.document.body,
                            {
                                name: "rect",
                                width: 64,
                                height: 64,
                                padding: 0,
                                config: {
                                    background: null,
                                    view: { stroke: null },
                                },
                                datasets: { rows: [row] },
                                data: { name: "rows" },
                                params: Object.entries({
                                    align: "center",
                                    strokeWidth: 6,
                                    strokeAlpha: 1,
                                    fillAlpha: 1,
                                    minimum: 0,
                                    round: 0,
                                }).map(([name, value]) => ({ name, value })),
                                mark: {
                                    type: "rect",
                                    fill: "red",
                                    stroke: "blue",
                                    clip: true,
                                    strokeAlign: { expr: "align" },
                                    strokeWidth: { expr: "strokeWidth" },
                                    strokeOpacity: { expr: "strokeAlpha" },
                                    fillOpacity: { expr: "fillAlpha" },
                                    minWidth: { expr: "minimum" },
                                    minHeight: 0,
                                    cornerRadius: { expr: "round" },
                                },
                                encoding: {
                                    x: position("x"),
                                    x2: { field: "x2" },
                                    y: position("y"),
                                    y2: { field: "y2" },
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
                            const view = api.views.get({
                                scope: [],
                                view: "rect",
                            });
                            const settle = () =>
                                new Promise((resolve) =>
                                    globalThis.requestAnimationFrame(() =>
                                        globalThis.requestAnimationFrame(
                                            resolve
                                        )
                                    )
                                );
                            const paint = async (values, rows) => {
                                if (rows) api.datasets.set("rows", rows);
                                for (const [name, value] of Object.entries(
                                    values
                                ))
                                    api.params.get(name).setValue(value);
                                await settle();
                            };
                            const live =
                                globalThis.document.querySelector("canvas");
                            const read = (ctx, xs) =>
                                xs.map((x) =>
                                    Array.from(
                                        ctx.getImageData(
                                            x * dpr,
                                            32 * dpr,
                                            1,
                                            1
                                        ).data
                                    )
                                );
                            const exportPixels = async (xs, mode = "png") => {
                                const result =
                                    mode === "png"
                                        ? await api.imageExport.raster({
                                              background: null,
                                              pixelRatio: dpr,
                                          })
                                        : await api.imageExport.svg({
                                              background: null,
                                              ...(mode === "hybrid" && {
                                                  rasterization: {
                                                      maxVectorInstances: 0,
                                                      pixelRatio: dpr,
                                                  },
                                              }),
                                          });
                                if (
                                    mode !== "png" &&
                                    (await result.blob.text()).includes(
                                        "<image"
                                    ) !==
                                        (mode === "hybrid")
                                ) {
                                    throw Error("Unexpected SVG export path");
                                }
                                const url = globalThis.URL.createObjectURL(
                                    result.blob
                                );
                                try {
                                    const image = new globalThis.Image();
                                    image.src = url;
                                    await image.decode();
                                    const canvas =
                                        new globalThis.OffscreenCanvas(
                                            64 * dpr,
                                            64 * dpr
                                        );
                                    const ctx = canvas.getContext("2d");
                                    ctx.drawImage(
                                        image,
                                        0,
                                        0,
                                        canvas.width,
                                        canvas.height
                                    );
                                    return read(ctx, xs);
                                } finally {
                                    globalThis.URL.revokeObjectURL(url);
                                }
                            };
                            const pick = async (x) => {
                                const hit = await view.marks.pick({ x, y: 32 });
                                return hit.status === "hit"
                                    ? hit.hit.datum.id
                                    : null;
                            };
                            const placements = {};
                            for (const align of [
                                "inside",
                                "center",
                                "outside",
                            ]) {
                                await paint({ align });
                                const xs = [12, 14, 18, 32];
                                placements[align] = {
                                    png: await exportPixels(xs),
                                    live:
                                        renderer === "canvas"
                                            ? read(live.getContext("2d"), xs)
                                            : null,
                                    pick: await pick(12),
                                };
                            }
                            await paint({
                                align: "outside",
                                strokeAlpha: 0.5,
                                fillAlpha: 0.5,
                                round: 6,
                            });
                            const translucent = await exportPixels([12, 18]);
                            const svg = await exportPixels([12, 18], "svg");
                            const hybrid = await exportPixels(
                                [12, 18],
                                "hybrid"
                            );
                            await paint({ strokeAlpha: 0 });
                            const invisible = await exportPixels([12, 18]);
                            await paint(
                                { strokeAlpha: 1, fillAlpha: 1, round: 0 },
                                [{ ...row, x: -0.125, x2: -0.03125 }]
                            );
                            const clipped = await exportPixels([2, 63]);
                            const edgePick = await pick(2);
                            await paint({ minimum: 8 }, [
                                { ...row, x: 0.5, x2: 0.5 },
                            ]);
                            const expanded = await exportPixels([24, 32]);
                            return {
                                placements,
                                translucent,
                                svg,
                                hybrid,
                                invisible,
                                clipped,
                                edgePick,
                                expanded,
                                liveSize: [live.width, live.height],
                            };
                        } finally {
                            api.finalize();
                        }
                    },
                    { core, renderer, dpr }
                );
                const expected = {
                    inside: [clear, clear, blue, red],
                    center: [clear, blue, blue, red],
                    outside: [blue, blue, red, red],
                };
                expect(result.liveSize).toEqual([64 * dpr, 64 * dpr]);
                for (const align of Object.keys(expected)) {
                    const sample = result.placements[align];
                    expect(sample.png).toEqual(expected[align]);
                    if (sample.live)
                        expect(sample.live).toEqual(expected[align]);
                    expect(sample.pick).toBe(
                        align === "outside" ? "rect" : null
                    );
                }
                for (const pixels of [
                    result.translucent,
                    result.svg,
                    result.hybrid,
                ]) {
                    expect(pixels).toEqual([
                        [0, 0, 255, 128],
                        [255, 0, 0, 128],
                    ]);
                }
                expect(result.invisible).toEqual([clear, [255, 0, 0, 128]]);
                expect(result.clipped).toEqual([blue, clear]);
                expect(result.edgePick).toBe("rect");
                expect(result.expanded).toEqual([blue, red]);
            } finally {
                await browser.close();
            }
        });
    }
}
