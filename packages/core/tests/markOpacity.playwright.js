import { fileURLToPath, URL } from "node:url";
import { platform } from "node:os";
import { expect, test } from "playwright/test";

const core = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));
for (const [renderer, markType] of ["canvas", "webgl", "webgpu"].flatMap(
    (renderer) => ["rect", "arrow"].map((type) => [renderer, type])
))
    for (const dpr of [1, 2]) {
        test(`${renderer} ${markType} opacity at DPR ${dpr}`, async ({
            playwright,
            baseURL,
        }) => {
            const browser = await playwright.chromium.launch({
                args: [
                    `--force-device-scale-factor=${dpr}`,
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
                ],
            });
            try {
                const page = await browser.newPage({ deviceScaleFactor: dpr });
                const errors = [];
                page.on("pageerror", (e) => errors.push(e.message));
                await page.route("**/rect-opacity", (r) =>
                    r.fulfill({
                        contentType: "text/html",
                        body: "<body style='margin:0'></body>",
                    })
                );
                await page.goto(new URL("/rect-opacity", baseURL).href);
                await page.exposeFunction("opacityScreenshot", async () =>
                    (
                        await page
                            .locator("#opacity canvas")
                            .screenshot({ omitBackground: true })
                    ).toString("base64")
                );
                for (const scene of [
                    "paint",
                    ...(markType === "rect"
                        ? [
                              "shadow",
                              ...(renderer === "webgl" ? ["conditional"] : []),
                          ]
                        : [
                              "overlap",
                              "conditional",
                              ...(renderer === "canvas" ? ["acute"] : []),
                          ]),
                ]) {
                    const results = await page.evaluate(checkOpacity, {
                        core,
                        renderer,
                        dpr,
                        scene,
                        markType,
                    });
                    for (const r of results) {
                        expect(r.dimensions).toEqual([
                            r.side * dpr,
                            r.side * dpr,
                        ]);
                        expect(r.restoreError).toBe(0);
                        expect(r.pick).toBe(
                            scene === "conditional" || scene === "overlap"
                                ? "front"
                                : "A"
                        );
                        if (scene === "conditional") {
                            expect(r.after).toEqual([102, 0, 153, 255]);
                            expect(r.zero).toEqual([0, 0, 255, 255]);
                        } else {
                            if (scene !== "overlap")
                                expect(
                                    r.maxError,
                                    JSON.stringify(r)
                                ).toBeLessThanOrEqual(2);
                            if (scene === "overlap")
                                for (const [i, v] of [
                                    17.05032, 21.42, 54.9576, 93.42792,
                                ].entries())
                                    expect(
                                        Math.abs(
                                            (i === 3
                                                ? r.after[i]
                                                : (r.after[i] * r.after[3]) /
                                                  255) - v
                                        ),
                                        JSON.stringify(r)
                                    ).toBeLessThanOrEqual(2);
                            expect(r.zeroAlpha).toBe(0);
                            if (scene === "paint")
                                for (const [i, v] of [
                                    21.42, 0, 30.6, 52.02,
                                ].entries())
                                    expect(
                                        Math.abs(
                                            (i === 3
                                                ? r.after[i]
                                                : (r.after[i] * r.after[3]) /
                                                  255) - v
                                        ),
                                        JSON.stringify(r)
                                    ).toBeLessThanOrEqual(2);
                        }
                    }
                }
                expect(errors).toEqual([]);
            } finally {
                await browser.close();
            }
        });
    }

/**
 * Observe public live/export output. The shadow scene also exercises nested
 * view fading, minimum-size isolation and scratch reuse at zero/restore.
 * @param {{core:string,renderer:string,dpr:number,scene:string,markType:string}} options
 */
async function checkOpacity({ core, renderer, dpr, scene, markType }) {
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
    const shadow = scene === "shadow",
        conditional = scene === "conditional",
        overlap = scene === "overlap",
        arrow = markType === "arrow",
        side = shadow ? 256 : 64;
    const host = globalThis.document.createElement("div");
    host.id = "opacity";
    host.style.cssText = `width:${side}px;height:${side}px`;
    globalThis.document.body.append(host);
    const row = {
        id: "A",
        x: arrow ? 0.125 : shadow ? 0.375 : 0.25,
        x2: arrow ? 0.875 : shadow ? 0.625 : 0.75,
        y: arrow ? 0.5 : 0.25,
        y2: arrow ? 0.5 : 0.75,
        a: 10,
    };
    const rows = conditional
        ? [
              { ...row, id: "back", color: "blue" },
              { ...row, id: "front", color: "red" },
          ]
        : overlap
          ? [
                { ...row, id: "back", color: "red" },
                { ...row, id: "front", color: "green" },
            ]
          : [row];
    /** @param {string} field */
    const position = (field) => ({
        field,
        type: "quantitative",
        scale: null,
        axis: null,
    });
    let spec = {
        name: "opacity",
        width: side,
        height: side,
        padding: 0,
        config: { background: null, view: { stroke: null, strokeWidth: 0 } },
        params: [
            { name: "fade", value: 1 },
            { name: "selected", select: "point" },
        ],
        datasets: { rows },
        data: { name: "rows" },
        mark: {
            type: markType,
            ...(arrow ? { filled: true, size: 16, headWidth: 2 } : {}),
            fill: "rgba(255,0,0,0.5)",
            stroke: "rgba(0,0,255,0.6)",
            strokeWidth: 8,
            fillOpacity: 0.6,
            strokeOpacity: 0.5,
            strokeAlign: "inside",
            ...(shadow
                ? {
                      strokeAlign: "outside",
                      minWidth: 80,
                      minOpacity: 0,
                      shadowOpacity: 1,
                      shadowColor: "lime",
                      shadowBlur: 20,
                  }
                : {}),
            ...(conditional
                ? { stroke: null, fillOpacity: 1, minOpacity: 1 }
                : {}),
        },
        encoding: {
            x: position("x"),
            x2: { field: "x2" },
            y: position("y"),
            y2: { field: "y2" },
            key: { field: "id" },
            opacity: {
                field: "a",
                type: "quantitative",
                scale: { domain: [0, 10], range: [0, 1] },
                legend: null,
            },
            ...(conditional
                ? {
                      fill: {
                          field: "color",
                          type: "nominal",
                          scale: {
                              domain: ["blue", "red"],
                              range: ["blue", "red"],
                          },
                          legend: null,
                      },
                      opacity: {
                          condition: {
                              param: "selected",
                              empty: false,
                              value: { expr: "fade" },
                          },
                          value: 1,
                      },
                  }
                : {}),
        },
    };
    if (overlap) {
        // Constant mark opacity must fade occurrences separately, including SVG paths.
        delete spec.encoding.opacity;
        spec.mark.opacity = { expr: "fade" };
        spec.encoding.fill = {
            field: "color",
            type: "nominal",
            scale: {
                domain: ["red", "green"],
                range: ["rgba(255,0,0,0.5)", "rgba(0,255,0,0.5)"],
            },
            legend: null,
        };
    }
    if (scene === "acute") {
        row.y = 0.125;
        row.y2 = 0.875;
        Object.assign(spec.mark, { size: 8, headAngle: 12, headWidth: 3 });
    }
    if (shadow) {
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
        /** @param {Blob} blob */
        const decode = async (blob) => {
            const url = globalThis.URL.createObjectURL(blob);
            try {
                const image = new globalThis.Image();
                image.src = url;
                await image.decode();
                const canvas = new globalThis.OffscreenCanvas(
                        side * dpr,
                        side * dpr
                    ),
                    context = canvas.getContext("2d");
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                return context.getImageData(0, 0, canvas.width, canvas.height)
                    .data;
            } finally {
                globalThis.URL.revokeObjectURL(url);
            }
        };
        const results = [];
        // Vector output is independent of the live backend; cover it once.
        for (const mode of [
            "live",
            "png",
            "hybrid",
            ...(renderer === "canvas" ? ["vector"] : []),
        ]) {
            /** @param {number} alpha */
            const capture = async (alpha) => {
                api.datasets.set(
                    "rows",
                    rows.map((r) => ({ ...r, a: alpha * 10 }))
                );
                api.params.get("fade").setValue(alpha);
                if (conditional)
                    api.views
                        .get({ scope: [], view: "opacity" })
                        .params.getSelection("selected")
                        .setValue([["front"]]);
                await new Promise((r) =>
                    globalThis.requestAnimationFrame(() =>
                        globalThis.requestAnimationFrame(r)
                    )
                );
                if (mode === "live")
                    return decode(
                        await (
                            await globalThis.fetch(
                                "data:image/png;base64," +
                                    (await globalThis.opacityScreenshot())
                            )
                        ).blob()
                    );
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
                                            pixelRatio: dpr,
                                        },
                                    }
                                  : {}),
                          });
                if (
                    mode !== "png" &&
                    (await result.blob.text()).includes("<image") !==
                        (mode === "hybrid")
                )
                    throw Error("Unexpected SVG export path");
                if (mode === "vector" && overlap && alpha < 1) {
                    const svg = new globalThis.DOMParser().parseFromString(
                        await result.blob.text(),
                        "image/svg+xml"
                    );
                    const paths = Array.from(
                        svg.querySelectorAll("path[opacity]")
                    );
                    if (
                        paths.length !== 2 ||
                        paths.some(
                            (path) =>
                                Number(path.getAttribute("opacity")) !== alpha
                        )
                    )
                        throw Error(
                            "Arrow opacity must remain on each occurrence path"
                        );
                }
                return decode(result.blob);
            };
            const before = await capture(1),
                after = await capture(0.4),
                zero = await capture(0);
            const hit = await api.views
                .get({ scope: [], view: "opacity" })
                .marks.pick({ x: side / 2, y: side / 2 });
            const restored = await capture(1);
            let maxError = 0,
                zeroAlpha = 0,
                restoreError = 0;
            for (let i = 0; i < before.length; i += 4) {
                maxError = Math.max(
                    maxError,
                    Math.abs(after[i + 3] - before[i + 3] * 0.4)
                );
                for (let c = 0; c < 3; c++)
                    maxError = Math.max(
                        maxError,
                        Math.abs(
                            (after[i + c] * after[i + 3]) / 255 -
                                ((before[i + c] * before[i + 3]) / 255) * 0.4
                        )
                    );
                zeroAlpha = Math.max(zeroAlpha, zero[i + 3]);
                for (let c = 0; c < 4; c++)
                    restoreError = Math.max(
                        restoreError,
                        Math.abs(restored[i + c] - before[i + c])
                    );
            }
            const offset =
                ((conditional || arrow ? 32 : 17) * dpr +
                    (arrow && !conditional ? 37 : 32) * dpr * side * dpr) *
                4;
            const canvas = host.querySelector("canvas");
            results.push({
                mode,
                side,
                dimensions: [canvas.width, canvas.height],
                maxError,
                zeroAlpha,
                restoreError,
                after: Array.from(after.slice(offset, offset + 4)),
                zero: Array.from(zero.slice(offset, offset + 4)),
                pick: hit.status === "hit" ? hit.hit.datum.id : null,
            });
        }
        return results;
    } finally {
        api.finalize();
        host.remove();
    }
}
