import { fileURLToPath, URL } from "node:url";
import { platform } from "node:os";
import { expect, test } from "@playwright/test";

const core =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));
for (const renderer of ["canvas", "webgl", "webgpu"]) {
    for (const dpr of [1, 2]) {
        test(`${renderer} rectangle alignment at DPR ${dpr}`, async ({
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
                    `--force-device-scale-factor=${dpr}`,
                ],
            });
            try {
                const page = await browser.newPage({ deviceScaleFactor: dpr });
                const errors = [];
                page.on("pageerror", (error) => errors.push(error.message));
                await page.route("**/rect-alignment", (route) =>
                    route.fulfill({
                        contentType: "text/html",
                        body: "<body></body>",
                    })
                );
                await page.goto(new URL("/rect-alignment", baseURL).href);
                await page.evaluate(installPixelReader);
                const result = await page.evaluate(checkAlignment, {
                    core,
                    dpr,
                    renderer,
                });
                if (result.mismatches.length) {
                    await test.info().attach("alignment-errors", {
                        body: JSON.stringify(result),
                        contentType: "application/json",
                    });
                    await page.screenshot({
                        path: test.info().outputPath("live.png"),
                        omitBackground: true,
                    });
                }
                expect(
                    result.mismatches.length,
                    JSON.stringify(result.mismatches.slice(0, 2))
                ).toBe(0);
                expect(result.checked).toBeGreaterThan(10000);
                if (renderer !== "canvas")
                    expect(result.gpuCoverageChecks).toBeGreaterThan(10000);
                expect(result.overlapError).toBeLessThanOrEqual(2);
                if (renderer === "canvas") {
                    const reuse = await page.evaluate(checkScratchReuse, {
                        core,
                        dpr,
                    });
                    expect(reuse).toEqual({ live: true, png: true });
                }
                {
                    await page.evaluate(async () => {
                        globalThis.document.body.style.margin = "0";
                        const api = globalThis.liveRectApi;
                        for (const [name, value] of Object.entries({
                            width: 6,
                            fa: 1,
                            sa: 1,
                            tl: 0,
                            tr: 0,
                            bl: 0,
                            br: 0,
                            minimum: 0,
                        }))
                            api.params.get(name).setValue(value);
                        api.datasets.set("rows", [
                            { x: 0.25, x2: 0.75, y: 0.25, y2: 0.75 },
                        ]);
                        await new Promise((resolve) =>
                            globalThis.requestAnimationFrame(() =>
                                globalThis.requestAnimationFrame(resolve)
                            )
                        );
                    });
                    try {
                        for (const align of ["inside", "center", "outside"]) {
                            await page.evaluate(async (align) => {
                                globalThis.liveRectApi.params
                                    .get("align")
                                    .setValue(align);
                                await new Promise((resolve) =>
                                    globalThis.requestAnimationFrame(() =>
                                        globalThis.requestAnimationFrame(
                                            resolve
                                        )
                                    )
                                );
                            }, align);
                            const colors = await readLiveColors(page, dpr);
                            const red = [255, 0, 0, 255],
                                blue = [0, 0, 255, 255],
                                empty = [0, 0, 0, 0];
                            expect(colors.slice(0, 7)).toEqual(
                                align === "inside"
                                    ? [
                                          empty,
                                          empty,
                                          blue,
                                          red,
                                          empty,
                                          empty,
                                          empty,
                                      ]
                                    : align === "center"
                                      ? [
                                            empty,
                                            blue,
                                            blue,
                                            red,
                                            blue,
                                            empty,
                                            empty,
                                        ]
                                      : [
                                            blue,
                                            blue,
                                            red,
                                            red,
                                            blue,
                                            blue,
                                            empty,
                                        ]
                            );
                            const picks = await page.evaluate(async () => {
                                const view = globalThis.liveRectApi.views.get({
                                    scope: [],
                                    view: "live-rect",
                                });
                                const result = [];
                                for (const x of [12, 32, 60])
                                    result.push(
                                        (await view.marks.pick({ x, y: 32 }))
                                            .status
                                    );
                                return result;
                            });
                            expect(picks).toEqual([
                                align === "outside" ? "hit" : "empty",
                                "hit",
                                "empty",
                            ]);
                            if (renderer !== "canvas" && align === "outside")
                                expect(colors[7][3]).toBe(255);
                        }
                        if (renderer !== "canvas") {
                            await page.evaluate(
                                async ({ dpr }) => {
                                    globalThis.liveRectApi.params
                                        .get("width")
                                        .setValue(0.25 / dpr);
                                    globalThis.liveRectApi.datasets.set(
                                        "rows",
                                        [
                                            {
                                                x: (15.5 + 0.5 / dpr) / 64,
                                                x2: 0.75,
                                                y: 0.25,
                                                y2: 0.75,
                                            },
                                        ]
                                    );
                                    await new Promise((resolve) =>
                                        globalThis.requestAnimationFrame(() =>
                                            globalThis.requestAnimationFrame(
                                                resolve
                                            )
                                        )
                                    );
                                },
                                { dpr }
                            );
                            // Cf=.5, Co=.75: the thin outside band contributes .25 blue coverage.
                            const thin = (await readLiveColors(page, dpr))[7];
                            for (const [i, value] of [
                                170, 0, 85, 191,
                            ].entries())
                                expect(
                                    Math.abs(thin[i] - value)
                                ).toBeLessThanOrEqual(2);
                        }
                        await checkZeroSizes(page, dpr, renderer);
                    } finally {
                        await page.evaluate(() =>
                            globalThis.liveRectApi.finalize()
                        );
                    }
                }
                expect(errors).toEqual([]);
            } finally {
                await browser.close();
            }
        });
    }
}

/** Installs the file-local decoder shared by the browser observation paths. */
function installPixelReader() {
    /** @param {Blob} blob @param {number} [width] @param {number} [height] */
    globalThis.readRectanglePixels = async (blob, width, height) => {
        const url = globalThis.URL.createObjectURL(blob);
        try {
            const image = new globalThis.Image();
            image.src = url;
            await image.decode();
            const canvas = new globalThis.OffscreenCanvas(
                width ?? image.naturalWidth,
                height ?? image.naturalHeight
            );
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return context.getImageData(0, 0, canvas.width, canvas.height);
        } finally {
            globalThis.URL.revokeObjectURL(url);
        }
    };
}

/** @param {import("@playwright/test").Page} page @param {number} dpr @param {number[][]} [points] */
async function readLiveColors(
    page,
    dpr,
    points = [12, 15, 18, 32, 50, 53, 57, 16].map((x) => [x, 32])
) {
    // Observe the compositor; a Canvas2D copy of a presented WebGPU texture can be empty.
    const screenshot = await page
        .locator("#live-rect canvas")
        .screenshot({ omitBackground: true });
    return page.evaluate(
        async ({ encoded, dpr, points }) => {
            const blob = await (
                await globalThis.fetch("data:image/png;base64," + encoded)
            ).blob();
            const pixels = await globalThis.readRectanglePixels(blob);
            return points.map(([x, y]) => {
                const offset = (y * dpr * pixels.width + x * dpr) * 4;
                return Array.from(pixels.data.slice(offset, offset + 4));
            });
        },
        { encoded: screenshot.toString("base64"), dpr, points }
    );
}

/** @param {import("@playwright/test").Page} page @param {number} dpr @param {string} renderer */
async function checkZeroSizes(page, dpr, renderer) {
    const points = [
        [32, 32],
        [32, 14],
        [32, 11],
        [14, 32],
        [11, 32],
        [30, 30],
        [27, 27],
    ];
    const blue = [0, 0, 255, 255],
        empty = [0, 0, 0, 0];
    const shapes = [
        {
            name: "vertical",
            row: { x: 0.5, x2: 0.5, y: 0.25, y2: 0.75 },
            outside: [0, 1, 2, 5, 6],
            gpuCenter: [0, 1, 5],
            canvasCenter: [0, 5],
        },
        {
            name: "horizontal",
            row: { x: 0.25, x2: 0.75, y: 0.5, y2: 0.5 },
            outside: [0, 3, 4, 5, 6],
            gpuCenter: [0, 3, 5],
            canvasCenter: [0, 5],
        },
        {
            name: "point",
            row: { x: 0.5, x2: 0.5, y: 0.5, y2: 0.5 },
            outside: [0, 5, 6],
            gpuCenter: [0, 5],
            canvasCenter: [],
        },
    ];
    for (const align of ["inside", "center", "outside"]) {
        for (const shape of shapes) {
            await page.evaluate(
                async ({ align, row }) => {
                    const api = globalThis.liveRectApi;
                    api.params.get("align").setValue(align);
                    api.params.get("width").setValue(6);
                    api.datasets.set("rows", [row]);
                    await new Promise((resolve) =>
                        globalThis.requestAnimationFrame(() =>
                            globalThis.requestAnimationFrame(resolve)
                        )
                    );
                },
                { align, row: shape.row }
            );
            const painted =
                align === "outside"
                    ? shape.outside
                    : align === "inside"
                      ? []
                      : renderer === "canvas"
                        ? shape.canvasCenter
                        : renderer === "webgpu"
                          ? shape.gpuCenter
                          : [];
            const expected = points.map((_, i) =>
                painted.includes(i) ? blue : empty
            );
            expect(
                await readLiveColors(page, dpr, points),
                `${renderer} ${align} ${shape.name}`
            ).toEqual(expected);
            for (const kind of renderer === "canvas"
                ? ["raster", "svg"]
                : ["raster"]) {
                const colors = await page.evaluate(
                    async ({ kind, dpr, points }) => {
                        const { blob } =
                            await globalThis.liveRectApi.imageExport[kind]({
                                background: null,
                                ...(kind === "raster"
                                    ? { pixelRatio: dpr }
                                    : {}),
                            });
                        const pixels = await globalThis.readRectanglePixels(
                            blob,
                            64 * dpr,
                            64 * dpr
                        );
                        return points.map(([x, y]) =>
                            Array.from(
                                pixels.data.slice(
                                    (y * dpr * pixels.width + x * dpr) * 4,
                                    (y * dpr * pixels.width + x * dpr) * 4 + 4
                                )
                            )
                        );
                    },
                    { kind, dpr, points }
                );
                expect(colors, `${kind} ${align} ${shape.name}`).toEqual(
                    kind === "svg" && align === "center"
                        ? points.map(() => empty)
                        : expected
                );
            }
            const pick = await page.evaluate(async () => {
                const view = globalThis.liveRectApi.views.get({
                    scope: [],
                    view: "live-rect",
                });
                return (await view.marks.pick({ x: 32, y: 32 })).status;
            });
            expect(pick).toBe(
                align === "outside" ||
                    (align === "center" && renderer === "webgpu")
                    ? "hit"
                    : "empty"
            );
        }
    }
}

/** @param {{core: string, dpr: number}} options */
async function checkScratchReuse({ core, dpr }) {
    const { embed } = await import(core + "minimal.js");
    const finalRows = [
        { x: 0.15, x2: 0.25, y: 0.1, y2: 0.9, color: "red" },
        { x: 0.2, x2: 0.4, y: 0.4, y2: 0.5, color: "blue" },
        { x: 0.45, x2: 0.5, y: 0.3, y2: 0.6, color: "green" },
    ];
    const encoding = {
        x: { field: "x", type: "quantitative", scale: null, axis: null },
        x2: { field: "x2" },
        y: { field: "y", type: "quantitative", scale: null, axis: null },
        y2: { field: "y2" },
        fill: { field: "color", type: "nominal", scale: null },
    };
    const unit = {
        opacity: 0.5,
        data: { name: "rows" },
        mark: {
            type: "rect",
            stroke: "purple",
            strokeWidth: 4,
            strokeAlign: "outside",
            cornerRadiusTopRight: 3,
            minWidth: 24,
            minHeight: 24,
            minOpacity: 0,
            clip: true,
        },
        encoding,
    };
    const spec = {
        padding: 0,
        spacing: 0,
        config: { background: null, view: { stroke: null, strokeWidth: 0 } },
        datasets: { rows: finalRows },
        hconcat: [
            { ...unit, width: 96, height: 96 },
            { width: 32, height: 32, opacity: 0.5, layer: [unit] },
        ],
    };
    const settle = () =>
        new Promise((resolve) =>
            globalThis.requestAnimationFrame(() =>
                globalThis.requestAnimationFrame(resolve)
            )
        );
    /** @param {boolean} history */
    async function capture(history) {
        const host = globalThis.document.createElement("div");
        host.style.cssText = "width:128px;height:96px";
        globalThis.document.body.append(host);
        const api = await embed(host, globalThis.structuredClone(spec), {
            renderer: "canvas",
        });
        try {
            await api.awaitVisibleLazyData(
                globalThis.AbortSignal.timeout(10000)
            );
            await settle();
            if (history) {
                // Reuse tall/narrow, short/wide and smaller occurrence layers, followed
                // by a nested sibling view that consumes the same depth as a view layer.
                for (const row of [
                    { x: 0.2, x2: 0.25, y: 0.05, y2: 0.95, color: "black" },
                    { x: 0.2, x2: 0.3, y: 0.4, y2: 0.45, color: "orange" },
                    { x: 0.1, x2: 0.3, y: 0.4, y2: 0.55, color: "blue" },
                ]) {
                    api.datasets.set("rows", [row]);
                    await settle();
                }
                api.datasets.set("rows", finalRows);
                await settle();
            }
            const canvas = host.querySelector("canvas");
            const live = canvas
                .getContext("2d")
                .getImageData(0, 0, canvas.width, canvas.height).data;
            const { blob } = await api.imageExport.raster({
                pixelRatio: dpr,
                background: null,
            });
            return {
                live,
                png: (await globalThis.readRectanglePixels(blob)).data,
            };
        } finally {
            api.finalize();
            host.remove();
        }
    }
    const reused = await capture(true),
        fresh = await capture(false);
    return Object.fromEntries(
        ["live", "png"].map((target) => [
            target,
            reused[target].length === fresh[target].length &&
                reused[target].every((value, i) => value === fresh[target][i]),
        ])
    );
}

/** @param {{core: string, dpr: number, renderer: string}} options */
async function checkAlignment({ core, dpr, renderer }) {
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
    // Preserve the real live WebGL framebuffer for observation after frame completion.
    const original = globalThis.HTMLCanvasElement.prototype.getContext;
    if (renderer === "webgl") {
        globalThis.HTMLCanvasElement.prototype.getContext = function (
            type,
            options
        ) {
            return original.call(
                this,
                type,
                type === "webgl2"
                    ? { ...options, preserveDrawingBuffer: true }
                    : options
            );
        };
    }
    const host = globalThis.document.createElement("div");
    host.id = "live-rect";
    host.style.cssText = "width:64px;height:64px";
    globalThis.document.body.append(host);
    const api = await embed(
        host,
        {
            name: "live-rect",
            width: 64,
            height: 64,
            padding: 0,
            config: {
                background: null,
                view: { stroke: null, strokeWidth: 0 },
            },
            datasets: { rows: [] },
            data: { name: "rows" },
            params: [
                { name: "align", value: "center" },
                { name: "width", value: 4 },
                { name: "fa", value: 1 },
                { name: "sa", value: 1 },
                { name: "tl", value: 0 },
                { name: "tr", value: 0 },
                { name: "bl", value: 0 },
                { name: "br", value: 0 },
                { name: "minimum", value: 0 },
            ],
            mark: {
                type: "rect",
                fill: "red",
                stroke: "blue",
                clip: true,
                strokeAlign: { expr: "align" },
                strokeWidth: { expr: "width" },
                fillOpacity: { expr: "fa" },
                strokeOpacity: { expr: "sa" },
                cornerRadiusTopLeft: { expr: "tl" },
                cornerRadiusTopRight: { expr: "tr" },
                cornerRadiusBottomLeft: { expr: "bl" },
                cornerRadiusBottomRight: { expr: "br" },
                minWidth: { expr: "minimum" },
                minHeight: 0,
                minOpacity: 0,
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
            },
        },
        {
            renderer,
            onError: (error) => {
                throw error;
            },
        }
    );
    globalThis.liveRectApi = api;
    try {
        await api.awaitVisibleLazyData(globalThis.AbortSignal.timeout(10000));
        const canvas = host.querySelector("canvas");
        const readCanvas = () => {
            const scratch = globalThis.document.createElement("canvas");
            scratch.width = canvas.width;
            scratch.height = canvas.height;
            const context = scratch.getContext("2d");
            context.drawImage(canvas, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const settle = () =>
            new Promise((resolve) =>
                globalThis.requestAnimationFrame(() =>
                    globalThis.requestAnimationFrame(resolve)
                )
            );
        /** @param {object} values @param {number[]} bounds */
        async function paint(values, bounds) {
            for (const [name, value] of Object.entries(values))
                api.params.get(name).setValue(value);
            const [x, y, w, h] = bounds;
            api.datasets.set("rows", [
                {
                    x: x / 64,
                    x2: (x + w) / 64,
                    y: (64 - y - h) / 64,
                    y2: (64 - y) / 64,
                },
            ]);
            await settle();
            return readCanvas();
        }
        let checked = 0,
            gpuCoverageChecks = 0;
        const mismatches = [];
        for (const align of ["inside", "center", "outside"]) {
            for (const candidate of [
                { name: "sharp" },
                {
                    name: "rounded paints",
                    radii: [5, 5, 5, 5],
                    width: 6,
                    fa: 0.6,
                    sa: 0.5,
                },
                {
                    name: "mixed paints",
                    radii: [0, 3, 7, 2],
                    width: 6,
                    fa: 0.6,
                    sa: 0.5,
                },
                {
                    name: "mixed opaque boundaries",
                    radii: [0, 3, 7, 2],
                    width: 6,
                },
                {
                    name: "consumed interior",
                    bounds: [28.25, 28.25, 8, 6],
                    radii: [2, 2, 2, 2],
                    width: 10,
                },
                {
                    name: "clamped radii",
                    bounds: [16.25, 20.25, 32, 20],
                    radii: [100, 4, 6, 8],
                    width: 2,
                    fa: 0.25,
                    sa: 0.75,
                },
                {
                    name: "minimum-size fade",
                    bounds: [28.25, 24.25, 4, 16],
                    radii: [0, 3, 3, 0],
                    minimum: 8,
                },
                {
                    name: "transparent stroke",
                    radii: [0, 3, 7, 2],
                    width: 12,
                    sa: 0,
                },
                {
                    name: "transparent fill",
                    radii: [4, 4, 4, 4],
                    width: 6,
                    fa: 0,
                    sa: 0.5,
                },
            ]) {
                const shape = {
                    bounds: [16.25, 20.25, 32, 24],
                    radii: [0, 0, 0, 0],
                    width: 4,
                    fa: 1,
                    sa: 1,
                    minimum: 0,
                    ...candidate,
                };
                const [tl, tr, br, bl] = shape.radii;
                const bytes = await paint(
                    {
                        align,
                        tl,
                        tr,
                        br,
                        bl,
                        width: shape.width,
                        fa: shape.fa,
                        sa: shape.sa,
                        minimum: shape.minimum,
                    },
                    shape.bounds
                );
                const { blob } = await api.imageExport.raster({
                    pixelRatio: dpr,
                    background: null,
                });
                const png = (await globalThis.readRectanglePixels(blob)).data;
                const targets = [
                    ...(renderer === "webgpu" ? [] : [["live", bytes]]),
                    ["png", png],
                ];
                if (renderer === "canvas") {
                    const vector = await api.imageExport.svg({
                        background: null,
                    });
                    targets.push([
                        "svg",
                        (
                            await globalThis.readRectanglePixels(
                                vector.blob,
                                64 * dpr,
                                64 * dpr
                            )
                        ).data,
                    ]);
                }
                const bounds = shape.bounds.slice();
                if (renderer !== "canvas") {
                    // Core's GPU placements include the existing half-logical-pixel raster offset.
                    bounds[0] += 0.5;
                    bounds[1] += 0.5;
                }
                const factor = shape.minimum
                    ? Math.min(1, bounds[2] / shape.minimum)
                    : 1;
                if (bounds[2] < shape.minimum) {
                    bounds[0] -= (shape.minimum - bounds[2]) / 2;
                    bounds[2] = shape.minimum;
                }
                const inset =
                    shape.width *
                    (align === "inside" ? 1 : align === "center" ? 0.5 : 0);
                const outset = shape.width - inset;
                const r = shape.radii.map((radius) =>
                    Math.min(radius, bounds[2] / 2, bounds[3] / 2)
                );
                const inner = [
                    bounds[0] + inset,
                    bounds[1] + inset,
                    bounds[2] - 2 * inset,
                    bounds[3] - 2 * inset,
                ];
                const outer = [
                    bounds[0] - outset,
                    bounds[1] - outset,
                    bounds[2] + 2 * outset,
                    bounds[3] + 2 * outset,
                ];
                const innerR = r.map((radius) => Math.max(0, radius - inset));
                const outerR = r.map((radius) =>
                    r.some(Boolean) ? radius + outset : 0
                );
                let caseChecked = 0,
                    interiorChecked = 0;
                const caseErrors = Object.fromEntries(
                        targets.map(([target]) => [target, 0])
                    ),
                    worst = {};
                for (let py = 0; py < 64 * dpr; py++)
                    for (let px = 0; px < 64 * dpr; px++) {
                        const x = (px + 0.5) / dpr,
                            y = (py + 0.5) / dpr;
                        const nominal = distance(x, y, bounds, r);
                        const di =
                            inner[2] > 0 && inner[3] > 0
                                ? distance(x, y, inner, innerR)
                                : Infinity;
                        const outerD = distance(x, y, outer, outerR);
                        if (
                            renderer !== "canvas" &&
                            shape.fa === 1 &&
                            shape.sa === 1
                        ) {
                            // Check GPU continuity at every internal paint boundary. Rounded
                            // outer edges also use independent finite-boundary distance coverage.
                            const coverage = r.some(Boolean)
                                ? Math.max(0, Math.min(1, 0.5 - outerD * dpr))
                                : outerD < -0.5 / dpr
                                  ? 1
                                  : undefined;
                            if (coverage !== undefined) {
                                const expectedAlpha = coverage * factor * 255;
                                const i = (py * 64 * dpr + px) * 4;
                                for (const [target, data] of targets) {
                                    const error = Math.abs(
                                        data[i + 3] - expectedAlpha
                                    );
                                    if (error > caseErrors[target]) {
                                        caseErrors[target] = error;
                                        worst[target] = {
                                            x,
                                            y,
                                            actualAlpha: data[i + 3],
                                            expectedAlpha,
                                        };
                                    }
                                }
                                gpuCoverageChecks++;
                            }
                        }
                        // The accepted Canvas allowance applies only within one physical pixel
                        // of an independently constructed nominal/inner/outer boundary.
                        if (
                            Math.min(
                                Math.abs(nominal),
                                Math.abs(di),
                                Math.abs(outerD)
                            ) *
                                dpr <=
                            1
                        )
                            continue;
                        const f = nominal < 0 ? shape.fa : 0;
                        const s = outerD < 0 && di > 0 ? shape.sa : 0;
                        const expected = [
                            f * (1 - s) * factor * 255,
                            0,
                            s * factor * 255,
                            (s + (1 - s) * f) * factor * 255,
                        ];
                        const i = (py * 64 * dpr + px) * 4;
                        for (const [target, data] of targets) {
                            const alpha = data[i + 3];
                            const actual = [
                                (data[i] * alpha) / 255,
                                (data[i + 1] * alpha) / 255,
                                (data[i + 2] * alpha) / 255,
                                alpha,
                            ];
                            const pixelError = Math.max(
                                ...actual.map((value, c) =>
                                    Math.abs(value - expected[c])
                                )
                            );
                            if (pixelError > caseErrors[target]) {
                                caseErrors[target] = pixelError;
                                worst[target] = { x, y, actual, expected };
                            }
                        }
                        if (outerD < 0) interiorChecked++;
                        checked++;
                        caseChecked++;
                    }
                for (const [target, error] of Object.entries(caseErrors))
                    if (interiorChecked === 0 || error > 2)
                        mismatches.push({
                            target,
                            align,
                            shape,
                            error,
                            caseChecked,
                            interiorChecked,
                            worst: worst[target],
                        });
            }
        }
        // Each occurrence resolves its own fractional min-size fade before the next one.
        await paint(
            {
                align: "inside",
                tl: 0,
                tr: 0,
                br: 0,
                bl: 0,
                width: 4,
                fa: 1,
                sa: 1,
                minimum: 8,
            },
            [28.25, 24.25, 4, 16]
        );
        api.datasets.set("rows", [
            {
                x: 28.25 / 64,
                x2: 32.25 / 64,
                y: (64 - 40.25) / 64,
                y2: (64 - 24.25) / 64,
            },
            {
                x: 30.25 / 64,
                x2: 36.25 / 64,
                y: (64 - 40.25) / 64,
                y2: (64 - 24.25) / 64,
            },
        ]);
        await settle();
        const overlapOffset =
            (Math.floor(30 * dpr) * canvas.width + Math.floor(31 * dpr)) * 4;
        let overlapBytes = readCanvas();
        if (renderer === "webgpu") {
            const { blob } = await api.imageExport.raster({
                pixelRatio: dpr,
                background: null,
            });
            overlapBytes = (await globalThis.readRectanglePixels(blob)).data;
        }
        const overlap = overlapBytes.slice(overlapOffset, overlapOffset + 4);
        const overlapError = Math.max(
            Math.abs(overlap[0]),
            Math.abs(overlap[1]),
            Math.abs((overlap[2] * overlap[3]) / 255 - 223),
            Math.abs(overlap[3] - 223)
        );
        return { checked, mismatches, overlapError, gpuCoverageChecks };
    } finally {
        globalThis.HTMLCanvasElement.prototype.getContext = original;
    }

    /** @param {number} x @param {number} y @param {number[]} b @param {number[]} radii */
    function distance(x, y, b, radii) {
        const px = x - b[0] - b[2] / 2,
            py = y - b[1] - b[3] / 2;
        const r =
            px > 0
                ? py > 0
                    ? radii[2]
                    : radii[1]
                : py > 0
                  ? radii[3]
                  : radii[0];
        const qx = Math.abs(px) - b[2] / 2 + r,
            qy = Math.abs(py) - b[3] / 2 + r;
        return (
            Math.min(Math.max(qx, qy), 0) +
            Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
            r
        );
    }
}
