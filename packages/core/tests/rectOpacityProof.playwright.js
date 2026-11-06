import { fileURLToPath, URL } from "node:url";
import { platform } from "node:os";
import process from "node:process";
import { test, expect } from "playwright/test";

const core = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));
for (const renderer of ["canvas", "webgl", "webgpu"])
    for (const dpr of [1, 2]) {
        test(`${renderer} rectangle common opacity proof DPR ${dpr}`, async ({
            playwright,
            baseURL,
        }) => {
            const browser = await playwright.chromium.launch({
                args: [
                    `--force-device-scale-factor=${dpr}`,
                    (renderer === "webgpu" ||
                        process.env.GENOMESPY_PROOF_HARDWARE === "1") &&
                    platform() === "darwin"
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
                ],
            });
            try {
                const page = await browser.newPage({ deviceScaleFactor: dpr });
                await page.exposeFunction("snapshotOpacityProof", async () =>
                    (
                        await page
                            .locator("#opacity-proof-host canvas")
                            .screenshot({ omitBackground: true })
                    ).toString("base64")
                );
                const errors = [];
                page.on("pageerror", (e) => errors.push(e.message));
                await page.route("**/opacity-proof", (r) =>
                    r.fulfill({
                        contentType: "text/html",
                        body: "<body style='margin:0'></body>",
                    })
                );
                await page.goto(new URL("/opacity-proof", baseURL).href);
                const results = await page.evaluate(
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
                        let side = 64;
                        const decode = async (blob) => {
                            const url = globalThis.URL.createObjectURL(blob);
                            try {
                                const image = new globalThis.Image();
                                image.src = url;
                                await image.decode();
                                const c = new globalThis.OffscreenCanvas(
                                        side * dpr,
                                        side * dpr
                                    ),
                                    ctx = c.getContext("2d");
                                ctx.drawImage(image, 0, 0, c.width, c.height);
                                return Array.from(
                                    ctx.getImageData(0, 0, c.width, c.height)
                                        .data
                                );
                            } finally {
                                globalThis.URL.revokeObjectURL(url);
                            }
                        };
                        const out = [];
                        for (const scenario of [
                            "paint",
                            "inside",
                            "outside",
                            "rgba",
                            "scaled",
                            "view-shadow-minimum",
                            "implicit",
                            "expression",
                            "conditional",
                            "wide-shadow",
                            "shadow-minimum",
                            "plain",
                            ...(renderer === "canvas" ? [] : ["hatch"]),
                        ]) {
                            side = scenario === "wide-shadow" ? 256 : 64;
                            const host =
                                globalThis.document.createElement("div");
                            host.id = "opacity-proof-host";
                            host.style.cssText = `width:${side}px;height:${side}px`;
                            globalThis.document.body.append(host);
                            const row = (a) => ({
                                x: 0.25,
                                x2: 0.75,
                                y: 0.25,
                                y2: 0.75,
                                a: scenario === "scaled" ? a * 10 : a,
                            });
                            const rows = (a) =>
                                scenario === "conditional"
                                    ? [
                                          {
                                              ...row(a),
                                              id: "back",
                                              color: "blue",
                                          },
                                          {
                                              ...row(a),
                                              id: "front",
                                              color: "red",
                                          },
                                      ]
                                    : [row(a)];
                            let spec = {
                                name: "proof",
                                width: side,
                                height: side,
                                padding: 0,
                                config: {
                                    background: null,
                                    view: { stroke: null, strokeWidth: 0 },
                                },
                                datasets: { rows: rows(1) },
                                data: { name: "rows" },
                                params: [
                                    { name: "common", value: 1 },
                                    { name: "selected", select: "point" },
                                ],
                                mark: {
                                    type: "rect",
                                    fill:
                                        scenario === "rgba"
                                            ? "rgba(255,0,0,0.5)"
                                            : "red",
                                    stroke:
                                        scenario === "plain" ||
                                        scenario === "conditional"
                                            ? null
                                            : scenario === "rgba"
                                              ? "rgba(0,0,255,0.6)"
                                              : "blue",
                                    strokeWidth: 8,
                                    ...(scenario === "implicit"
                                        ? {}
                                        : {
                                              fillOpacity: 0.6,
                                              strokeOpacity: 0.5,
                                          }),
                                    ...(scenario === "expression"
                                        ? { opacity: { expr: "common" } }
                                        : {}),
                                    strokeAlign:
                                        scenario === "inside" ||
                                        scenario === "outside"
                                            ? scenario
                                            : "center",
                                    ...(scenario === "conditional"
                                        ? { fillOpacity: 1, minOpacity: 1 }
                                        : {}),
                                    ...(scenario === "wide-shadow"
                                        ? {
                                              shadowOpacity: 1,
                                              shadowColor: "lime",
                                              shadowBlur: 20,
                                              shadowOffsetX: 0,
                                          }
                                        : {}),
                                    ...(scenario === "shadow-minimum" ||
                                    scenario === "view-shadow-minimum"
                                        ? {
                                              minWidth: 40,
                                              minOpacity: 0,
                                              shadowOpacity: 0.7,
                                              shadowColor: "lime",
                                              shadowOffsetX: 8,
                                              shadowBlur: 2,
                                          }
                                        : {}),
                                    ...(scenario === "hatch"
                                        ? { hatch: "vertical" }
                                        : {}),
                                },
                                encoding: {
                                    x: {
                                        field: "x",
                                        type: "quantitative",
                                        scale: null,
                                        axis: null,
                                    },
                                    x2: { field: "x2" },
                                    y: {
                                        field: "y",
                                        type: "quantitative",
                                        scale: null,
                                        axis: null,
                                    },
                                    y2: { field: "y2" },
                                    ...(scenario === "conditional"
                                        ? {
                                              key: { field: "id" },
                                              fill: {
                                                  field: "color",
                                                  type: "nominal",
                                                  legend: null,
                                                  scale: {
                                                      domain: ["blue", "red"],
                                                      range: ["blue", "red"],
                                                  },
                                              },
                                              opacity: {
                                                  condition: {
                                                      param: "selected",
                                                      empty: false,
                                                      value: {
                                                          expr: "common",
                                                      },
                                                  },
                                                  value: 1,
                                              },
                                          }
                                        : scenario === "expression"
                                          ? {}
                                          : {
                                                opacity: {
                                                    field: "a",
                                                    type: "quantitative",
                                                    legend: null,
                                                    scale:
                                                        scenario === "scaled"
                                                            ? {
                                                                  domain: [
                                                                      0, 10,
                                                                  ],
                                                                  range: [0, 1],
                                                              }
                                                            : null,
                                                },
                                            }),
                                },
                            };
                            if (scenario === "view-shadow-minimum") {
                                const { params, datasets, ...child } = spec;
                                spec = {
                                    width: side,
                                    height: side,
                                    padding: 0,
                                    config: spec.config,
                                    params,
                                    datasets,
                                    opacity: 0.5,
                                    layer: [{ ...child, opacity: 0.6 }],
                                };
                            }
                            const api = await embed(host, spec, {
                                renderer,
                                onError: (e) => {
                                    throw e;
                                },
                            });
                            try {
                                for (const mode of [
                                    "live",
                                    "png",
                                    "svg",
                                    "hybrid",
                                ]) {
                                    const capture = async (a) => {
                                        api.datasets.set("rows", rows(a));
                                        if (scenario === "conditional")
                                            api.views
                                                .get({
                                                    scope: [],
                                                    view: "proof",
                                                })
                                                .params.getSelection("selected")
                                                .setValue([["front"]]);
                                        api.params.get("common").setValue(a);
                                        await new Promise((r) =>
                                            globalThis.requestAnimationFrame(
                                                () =>
                                                    globalThis.requestAnimationFrame(
                                                        r
                                                    )
                                            )
                                        );
                                        if (mode === "live") {
                                            const encoded =
                                                await globalThis.snapshotOpacityProof();
                                            return decode(
                                                await (
                                                    await globalThis.fetch(
                                                        "data:image/png;base64," +
                                                            encoded
                                                    )
                                                ).blob()
                                            );
                                        }
                                        const result =
                                            mode === "png"
                                                ? await api.imageExport.raster({
                                                      background: null,
                                                      pixelRatio: dpr,
                                                  })
                                                : await api.imageExport.svg({
                                                      background: null,
                                                      ...(mode === "hybrid"
                                                          ? {
                                                                rasterization: {
                                                                    maxVectorInstances: 0,
                                                                    pixelRatio:
                                                                        dpr,
                                                                },
                                                            }
                                                          : {}),
                                                  });
                                        if (mode !== "png") {
                                            const text =
                                                await result.blob.text();
                                            if (
                                                text.includes("<image") !==
                                                (mode === "hybrid")
                                            )
                                                throw Error(
                                                    "Unexpected export route"
                                                );
                                        }
                                        return decode(result.blob);
                                    };
                                    const before = await capture(1),
                                        after = await capture(0.4),
                                        zero = await capture(0);
                                    const zeroPick = (
                                        await api.views
                                            .get({ scope: [], view: "proof" })
                                            .marks.pick({
                                                x: side / 2,
                                                y: side / 2,
                                            })
                                    ).status;
                                    const restore = await capture(1);
                                    let max = 0,
                                        zeroAlpha = 0,
                                        restoreError = 0;
                                    for (let i = 0; i < before.length; i += 4) {
                                        max = Math.max(
                                            max,
                                            Math.abs(
                                                after[i + 3] -
                                                    before[i + 3] * 0.4
                                            )
                                        );
                                        for (let c = 0; c < 3; c++)
                                            max = Math.max(
                                                max,
                                                Math.abs(
                                                    (after[i + c] *
                                                        after[i + 3]) /
                                                        255 -
                                                        ((before[i + c] *
                                                            before[i + 3]) /
                                                            255) *
                                                            0.4
                                                )
                                            );
                                        zeroAlpha = Math.max(
                                            zeroAlpha,
                                            zero[i + 3]
                                        );
                                        restoreError = Math.max(
                                            restoreError,
                                            ...restore
                                                .slice(i, i + 4)
                                                .map((v, c) =>
                                                    Math.abs(v - before[i + c])
                                                )
                                        );
                                    }
                                    const at = (x, y) =>
                                        after.slice(
                                            (y * dpr * side * dpr + x * dpr) *
                                                4,
                                            (y * dpr * side * dpr + x * dpr) *
                                                4 +
                                                4
                                        );
                                    out.push({
                                        scenario,
                                        side,
                                        mode,
                                        max,
                                        zeroAlpha,
                                        restoreError,
                                        zeroPick,
                                        overlap: at(17, 32),
                                        neighbors: [
                                            at(16, 32),
                                            at(18, 32),
                                            at(19, 32),
                                        ],
                                        dimensions: [
                                            host.querySelector("canvas").width,
                                            host.querySelector("canvas").height,
                                            globalThis.devicePixelRatio,
                                        ],
                                        fill: at(32, 32),
                                        zeroCenter: zero.slice(
                                            ((side / 2) * dpr * side * dpr +
                                                (side / 2) * dpr) *
                                                4,
                                            ((side / 2) * dpr * side * dpr +
                                                (side / 2) * dpr) *
                                                4 +
                                                4
                                        ),
                                    });
                                }
                            } finally {
                                api.finalize();
                                host.remove();
                            }
                        }
                        return out;
                    },
                    { core, renderer, dpr }
                );
                await test.info().attach("opacity-proof", {
                    body: JSON.stringify(results),
                    contentType: "application/json",
                });
                for (const r of results) {
                    if (r.scenario !== "conditional")
                        expect(r.max, JSON.stringify(r)).toBeLessThanOrEqual(2);
                    if (r.mode === "live")
                        expect(r.dimensions, JSON.stringify(r)).toEqual([
                            r.side * dpr,
                            r.side * dpr,
                            dpr,
                        ]);
                    expect(r.zeroAlpha, JSON.stringify(r)).toBe(
                        r.scenario === "conditional" ? 255 : 0
                    );
                    if (r.scenario === "conditional")
                        expect(r.zeroCenter).toEqual([0, 0, 255, 255]);
                    if (r.scenario === "conditional")
                        for (const [i, v] of [102, 0, 153, 255].entries())
                            expect(
                                Math.abs(r.overlap[i] - v),
                                JSON.stringify(r)
                            ).toBeLessThanOrEqual(2);
                    expect(r.restoreError).toBe(0);
                    expect(r.zeroPick).toBe("hit");
                    if (r.scenario === "rgba")
                        for (const [i, v] of [21.42, 0, 30.6, 52.02].entries())
                            expect(
                                Math.abs(
                                    (i === 3
                                        ? r.overlap[i]
                                        : (r.overlap[i] * r.overlap[3]) / 255) -
                                        v
                                ),
                                JSON.stringify(r)
                            ).toBeLessThanOrEqual(2);
                    if (r.scenario === "paint")
                        // Compare premultiplied color, not unstable unpremultiplied bytes at low alpha.
                        for (const [i, v] of [30.6, 0, 51, 81.6].entries())
                            expect(
                                Math.abs(
                                    (i === 3
                                        ? r.overlap[i]
                                        : (r.overlap[i] * r.overlap[3]) / 255) -
                                        v
                                ),
                                JSON.stringify(r)
                            ).toBeLessThanOrEqual(2);
                }
                expect(errors).toEqual([]);
            } finally {
                await browser.close();
            }
        });
    }
