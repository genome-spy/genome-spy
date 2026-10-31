/* global document, AbortSignal, Image, URL, requestAnimationFrame, structuredClone, console */

import assert from "node:assert/strict";
import {
    loadPlaywright,
    startDevServer,
    stopServer,
    waitForServer,
} from "./captureScreenshots.mjs";

const origin = "http://127.0.0.1:4174";
const server = await startDevServer(origin);
try {
    await waitForServer(origin, server);
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    try {
        for (const renderer of ["webgl", "canvas"]) {
            for (const dpr of [1, 2]) {
                const context = await browser.newContext({
                    deviceScaleFactor: dpr,
                });
                try {
                    const page = await context.newPage();
                    const errors = [];
                    page.on("pageerror", (error) => errors.push(error.message));
                    await page.goto(`${origin}/screenshot.html`);
                    const result = await page.evaluate(
                        async ({ renderer, dpr }) => {
                            const { embed } = await import("/index.js");
                            document.body.replaceChildren();
                            const host = document.createElement("div");
                            document.body.append(host);
                            const data = [
                                {
                                    id: "horizontal",
                                    x: 0.1,
                                    x2: 0.9,
                                    y: 0.5,
                                    y2: 0.5,
                                    width: 10,
                                },
                                {
                                    id: "vertical",
                                    x: 0.5,
                                    x2: 0.5,
                                    y: 0.2,
                                    y2: 0.8,
                                    width: 4,
                                },
                            ];
                            const spec = {
                                width: 200,
                                height: 100,
                                padding: 0,
                                params: [
                                    { name: "border", value: 2 },
                                    { name: "ink", value: "white" },
                                ],
                                data: { values: data },
                                mark: {
                                    type: "rule",
                                    color: "#777777",
                                    opacity: 1,
                                    outlineWidth: { expr: "border" },
                                    outlineColor: { expr: "ink" },
                                    tooltip: false,
                                },
                                encoding: {
                                    ...Object.fromEntries(
                                        ["x", "x2", "y", "y2"].map((field) => [
                                            field,
                                            {
                                                field,
                                                type: "quantitative",
                                                scale: null,
                                                axis: null,
                                            },
                                        ])
                                    ),
                                    size: {
                                        field: "width",
                                        type: "quantitative",
                                        scale: null,
                                    },
                                },
                            };
                            const settle = () =>
                                new Promise((resolve) =>
                                    requestAnimationFrame(() =>
                                        requestAnimationFrame(resolve)
                                    )
                                );
                            const open = async (s) => {
                                const api = await embed(host, s, {
                                    renderer,
                                    onError(error) {
                                        throw error;
                                    },
                                });
                                await api.awaitVisibleLazyData(
                                    AbortSignal.timeout(5000)
                                );
                                await settle();
                                return api;
                            };
                            const raster = async (api, vector = false) => {
                                const { blob } = vector
                                    ? await api.imageExport.svg({
                                          background: null,
                                      })
                                    : await api.imageExport.raster({
                                          background: null,
                                          pixelRatio: dpr,
                                      });
                                const image = new Image();
                                const url = URL.createObjectURL(blob);
                                image.src = url;
                                await image.decode();
                                const canvas = document.createElement("canvas");
                                canvas.width = 200 * dpr;
                                canvas.height = 100 * dpr;
                                const ctx = canvas.getContext("2d");
                                ctx.drawImage(
                                    image,
                                    0,
                                    0,
                                    canvas.width,
                                    canvas.height
                                );
                                URL.revokeObjectURL(url);
                                return ctx.getImageData(
                                    0,
                                    0,
                                    canvas.width,
                                    canvas.height
                                );
                            };
                            const pixel = (image, x, y) => {
                                const start =
                                    (Math.floor(y * dpr) * image.width +
                                        Math.floor(x * dpr)) *
                                    4;
                                return Array.from(
                                    image.data.slice(start, start + 4)
                                );
                            };
                            const api = await open(spec);
                            const outputs = [];
                            for (const vector of [false, true]) {
                                const image = await raster(api, vector);
                                outputs.push({
                                    vector,
                                    core: pixel(image, 100, 50),
                                    border: pixel(image, 103, 50),
                                    underneath: pixel(image, 105, 50),
                                });
                            }
                            const pick = async (x, y) => {
                                const p = await api.views
                                    .root()
                                    .marks.pick({ x, y });
                                return p.status == "hit"
                                    ? p.hit.datum.id
                                    : p.status;
                            };
                            const picks = [
                                await pick(103, 50),
                                await pick(105, 50),
                                await pick(103, 10),
                            ];
                            api.params.get("ink").setValue("red");
                            await settle();
                            const red = pixel(await raster(api), 103, 50);
                            api.params.get("border").setValue(0);
                            await settle();
                            const zero = await raster(api);
                            api.finalize();
                            const plain = structuredClone(spec);
                            delete plain.mark.outlineWidth;
                            delete plain.mark.outlineColor;
                            const plainApi = await open(plain);
                            const unchanged = (
                                await raster(plainApi)
                            ).data.every((v, i) => v === zero.data[i]);
                            plainApi.finalize();
                            const alpha = [];
                            for (const cap of [
                                "butt",
                                "square",
                                "round",
                                "dashed",
                            ]) {
                                const translucent = structuredClone(spec);
                                translucent.data.values = [data[0]];
                                translucent.mark.opacity = 0.5;
                                translucent.mark.strokeCap =
                                    cap == "dashed" ? "butt" : cap;
                                if (cap == "dashed")
                                    translucent.mark.strokeDash = [12, 12];
                                const a = await open(translucent);
                                for (const vector of [false, true]) {
                                    const image = await raster(a, vector);
                                    let max = 0;
                                    for (
                                        let i = 3;
                                        i < image.data.length;
                                        i += 4
                                    )
                                        max = Math.max(max, image.data[i]);
                                    alpha.push({
                                        cap,
                                        vector,
                                        max,
                                        center: pixel(image, 100, 50),
                                        gap: pixel(image, 38, 50),
                                    });
                                }
                                a.finalize();
                                delete translucent.mark.outlineWidth;
                                const control = await open(translucent);
                                for (const sample of alpha.slice(-2)) {
                                    sample.reference = pixel(
                                        await raster(control, sample.vector),
                                        100,
                                        50
                                    );
                                }
                                control.finalize();
                            }
                            const zoomSpec = structuredClone(spec);
                            zoomSpec.data.values = [data[0]];
                            for (const axis of ["x", "y"]) {
                                zoomSpec.encoding[axis].scale = {
                                    name: axis,
                                    domain: [0, 1],
                                    zero: false,
                                    zoom: true,
                                };
                                zoomSpec.encoding[axis + "2"] = {
                                    field: axis + "2",
                                    type: "quantitative",
                                };
                            }
                            const zoomApi = await open(zoomSpec);
                            await zoomApi
                                .getScaleResolutionByName("x")
                                .zoomTo([0.25, 0.75]);
                            await zoomApi
                                .getScaleResolutionByName("y")
                                .zoomTo([0.25, 0.75]);
                            await settle();
                            const zoomImage = await raster(zoomApi);
                            const zoomed = pixel(zoomImage, 100, 44);
                            zoomApi.finalize();

                            const thinSpec = structuredClone(spec);
                            thinSpec.data.values = [
                                { ...data[0], width: 0.25 },
                            ];
                            const thinApi = await open(thinSpec);
                            const thin = pixel(await raster(thinApi), 100, 51);
                            thinApi.finalize();
                            return {
                                outputs,
                                picks,
                                red,
                                unchanged,
                                alpha,
                                zoomed,
                                thin,
                            };
                        },
                        { renderer, dpr }
                    );
                    assert.deepEqual(errors, []);
                    for (const output of result.outputs) {
                        assert.deepEqual(output.core, [119, 119, 119, 255]);
                        assert.deepEqual(output.border, [255, 255, 255, 255]);
                        assert.deepEqual(
                            output.underneath,
                            [119, 119, 119, 255]
                        );
                    }
                    assert.deepEqual(result.picks, [
                        "vertical",
                        "horizontal",
                        "empty",
                    ]);
                    assert.deepEqual(result.red, [255, 0, 0, 255]);
                    assert.equal(result.unchanged, true);
                    assert.deepEqual(result.zoomed, [255, 255, 255, 255]);
                    assert.deepEqual(result.thin, [255, 255, 255, 255]);
                    for (const sample of result.alpha) {
                        assert.ok(
                            sample.max >= 127 && sample.max <= 129,
                            JSON.stringify(sample)
                        );
                        assert.deepEqual(
                            sample.center,
                            sample.reference,
                            JSON.stringify(sample)
                        );
                        if (sample.cap == "dashed")
                            assert.equal(sample.gap[3], 0);
                    }
                    console.log(
                        `${renderer}, DPR ${dpr}: crossings, widths, picking, live properties, defaults, caps, opacity and SVG passed.`
                    );
                } finally {
                    await context.close();
                }
            }
        }
    } finally {
        await browser.close();
    }
} finally {
    await stopServer(server);
}
