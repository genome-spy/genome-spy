import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { expect, test } from "playwright/test";

const coreSource =
    "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));
for (const renderer of ["canvas", "webgl", "webgpu"])
    for (const dpr of [1, 2]) {
        test(`${renderer} text fill opacity at DPR ${dpr}`, async ({
            playwright,
            baseURL,
        }) => {
            const softwareWebGpu =
                renderer === "webgpu" && process.platform === "linux";
            const browser = await playwright.chromium.launch({
                channel: renderer === "webgpu" ? "chrome" : undefined,
                args: [
                    "--enable-unsafe-webgpu",
                    softwareWebGpu
                        ? "--enable-features=Vulkan"
                        : "--enable-features=WebGPU",
                    "--ignore-gpu-blocklist",
                    `--force-device-scale-factor=${dpr}`,
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
                          : [
                                "--use-angle=swiftshader",
                                "--enable-unsafe-swiftshader",
                            ]),
                ],
            });
            const page = await browser.newPage({ deviceScaleFactor: dpr });
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            try {
                await page.route("**/text-alpha-proof", (route) =>
                    route.fulfill({
                        contentType: "text/html",
                        body: "<body style='margin:0'></body>",
                    })
                );
                await page.goto(new URL("/text-alpha-proof", baseURL).href);
                const result = await page.evaluate(verifyTextOpacity, {
                    coreSource,
                    renderer,
                    dpr,
                });
                expect(result.backing).toEqual([192 * dpr, 96 * dpr]);
                expect(result.visiblePixels).toBeGreaterThan(100);
                expect(result.errors).toEqual([0, 0, 0, 0, 0, 0]);
                expect(result.empty).toBe(true);
                expect(result.zero).toBe(true);
                expect(result.restored).toBe(true);
                expect(["A", "B"]).toContain(result.picks[0]);
                expect(result.picks[0]).toBe(result.picks[1]);
                expect(errors).toEqual([]);
            } finally {
                await browser.close();
            }
        });
    }

/** @param {{coreSource: string, renderer: string, dpr: number}} options */
async function verifyTextOpacity({ coreSource, renderer, dpr }) {
    const { embed } = await import(coreSource + "minimal.js");
    await import(
        coreSource +
            (renderer === "webgpu"
                ? "rendering/webgpu/register.js"
                : renderer === "webgl"
                  ? "rendering/registerWebGL.js"
                  : "rendering/registerCanvas.js")
    );
    const rows = [
        { id: "A", x: 0.48, label: "ffl", alpha: 0.25 },
        { id: "B", x: 0.52, label: "jÁ", alpha: 0.75 },
    ];
    const wait = () =>
        new Promise((resolve) =>
            globalThis.requestAnimationFrame(() =>
                globalThis.requestAnimationFrame(resolve)
            )
        );
    const apps = [];
    for (const reference of [false, true]) {
        const host = globalThis.document.createElement("div");
        host.style.cssText = "width:192px;height:96px";
        globalThis.document.body.append(host);
        const alpha = reference
            ? { field: "ref", type: "quantitative", scale: null }
            : {
                  condition: {
                      test: { param: "picked", empty: false },
                      value: { expr: "selectedAlpha" },
                  },
                  field: "alpha",
                  type: "quantitative",
                  scale: { domain: [0, 1], range: [0, 0.8] },
                  legend: null,
              };
        const api = await embed(
            host,
            {
                width: 192,
                height: 96,
                padding: 0,
                config: {
                    background: null,
                    view: { stroke: null, strokeWidth: 0 },
                },
                datasets: { rows: [] },
                params: [
                    { name: "selectedAlpha", value: 0.4 },
                    { name: "fade", value: 1 },
                ],
                opacity: { expr: "fade" },
                layer: [
                    {
                        name: "labels",
                        data: { name: "rows" },
                        params: [{ name: "picked", select: "point" }],
                        mark: {
                            type: "text",
                            size: 32,
                            align: "center",
                            baseline: "middle",
                            opacity: 0.5,
                        },
                        encoding: {
                            key: { field: "id" },
                            text: { field: "label" },
                            x: {
                                field: "x",
                                type: "quantitative",
                                scale: null,
                                axis: null,
                            },
                            y: { value: 0.5 },
                            color: {
                                field: "id",
                                type: "nominal",
                                scale: {
                                    domain: ["A", "B"],
                                    range: [
                                        "rgba(255,0,0,.8)",
                                        "rgba(0,0,255,.6)",
                                    ],
                                },
                                legend: null,
                            },
                            [reference ? "opacity" : "fillOpacity"]: alpha,
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
        await api.awaitVisibleLazyData(globalThis.AbortSignal.timeout(10000));
        apps.push({ api, host, reference });
    }
    /** @param {import("../src/types/embedApi.js").EmbedResult} api */
    async function capture(api) {
        const { blob } = await api.imageExport.raster({
            pixelRatio: dpr,
            background: null,
        });
        const image = await globalThis.createImageBitmap(blob);
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        image.close();
        return Array.from(
            context.getImageData(0, 0, canvas.width, canvas.height).data
        );
    }
    let first, probe;
    let visiblePixels = 0,
        empty = false,
        zero = false,
        restored = false;
    const errors = [],
        picks = [];
    try {
        // The old opacity channel is an independent single-fill reference for the new factor.
        for (const state of [
            { name: "field", picked: null, factor: 0.4, fade: 1 },
            { name: "selected", picked: "A", factor: 0.4, fade: 1 },
            { name: "scoped", picked: "B", factor: 0.2, fade: 0.5 },
            { name: "zero", picked: null, factor: 0, fade: 1 },
            { name: "empty", picked: null, factor: 0.4, fade: 1 },
            { name: "restore", picked: null, factor: 0.4, fade: 1 },
        ]) {
            const data =
                state.name === "empty"
                    ? []
                    : rows.map((row) => ({
                          ...row,
                          alpha: state.name === "zero" ? 0 : row.alpha,
                      }));
            for (const { api, reference } of apps) {
                api.params.get("selectedAlpha").setValue(state.factor);
                api.params.get("fade").setValue(state.fade);
                api.datasets.set(
                    "rows",
                    data.map((row) => ({
                        ...row,
                        ref:
                            0.5 *
                            (row.id === state.picked
                                ? state.factor
                                : row.alpha * 0.8),
                    }))
                );
                if (!reference) {
                    const selected = api.views
                        .get({ scope: [], view: "labels" })
                        .params.getSelection("picked");
                    if (state.picked) selected.setValue([[state.picked]]);
                    else selected.clear();
                }
            }
            await wait();
            const actual = await capture(apps[0].api),
                reference = await capture(apps[1].api);
            let error = 0,
                visible = 0,
                best = -1,
                index = 0;
            for (let i = 0; i < actual.length; i++)
                error = Math.max(error, Math.abs(actual[i] - reference[i]));
            for (let i = 3; i < actual.length; i += 4) {
                if (actual[i]) visible++;
                if (actual[i] > best) {
                    best = actual[i];
                    index = i - 3;
                }
            }
            errors.push(error);
            if (state.name === "field") {
                visiblePixels = visible;
                first = actual;
                probe = {
                    x: (((index / 4) % (192 * dpr)) + 0.5) / dpr,
                    y: (Math.floor(index / 4 / (192 * dpr)) + 0.5) / dpr,
                };
            }
            if (state.name === "zero") zero = visible === 0;
            if (state.name === "empty") empty = visible === 0;
            if (state.name === "restore")
                restored = first.every((value, i) => value === actual[i]);
        }
        for (const { api } of apps) {
            const hit = await api.views
                .get({ scope: [], view: "labels" })
                .marks.pick(probe);
            picks.push(hit.status === "hit" ? hit.hit.datum.id : hit.status);
        }
        return {
            backing: [
                apps[0].host.querySelector("canvas").width,
                apps[0].host.querySelector("canvas").height,
            ],
            visiblePixels,
            errors,
            empty,
            zero,
            restored,
            picks,
        };
    } finally {
        for (const { api, host } of apps) {
            api.finalize();
            host.remove();
        }
    }
}
