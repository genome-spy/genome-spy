import { fileURLToPath, URL } from "node:url";
import { expect, test } from "@playwright/test";

const core =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));
for (const dpr of [1, 2]) {
    test(`Canvas rectangle alignment at DPR ${dpr}`, async ({
        playwright,
        baseURL,
    }) => {
        const browser = await playwright.chromium.launch({
            args: [
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
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
            const result = await page.evaluate(checkAlignment, { core, dpr });
            expect(result.mismatches).toEqual([]);
            expect(result.checked).toBeGreaterThan(10000);
            expect(result.overlapError).toBeLessThanOrEqual(2);
            const reuse = await page.evaluate(checkScratchReuse, { core, dpr });
            expect(reuse).toEqual({ live: true, png: true });
            expect(errors).toEqual([]);
        } finally {
            await browser.close();
        }
    });
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
        const api = await embed(host, structuredClone(spec), {
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
            const image = await globalThis.createImageBitmap(blob);
            const scratch = globalThis.document.createElement("canvas");
            scratch.width = image.width;
            scratch.height = image.height;
            const ctx = scratch.getContext("2d");
            ctx.drawImage(image, 0, 0);
            image.close();
            return {
                live,
                png: ctx.getImageData(0, 0, scratch.width, scratch.height).data,
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

/** @param {{core: string, dpr: number}} options */
async function checkAlignment({ core, dpr }) {
    const { embed } = await import(core + "minimal.js");
    await import(core + "rendering/registerCanvas.js");
    const host = globalThis.document.createElement("div");
    host.style.cssText = "width:64px;height:64px";
    globalThis.document.body.append(host);
    const api = await embed(
        host,
        {
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
            renderer: "canvas",
            onError: (error) => {
                throw error;
            },
        }
    );
    try {
        await api.awaitVisibleLazyData(globalThis.AbortSignal.timeout(10000));
        const canvas = host.querySelector("canvas"),
            context = canvas.getContext("2d");
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
            return Array.from(
                context.getImageData(0, 0, 64 * dpr, 64 * dpr).data
            );
        }
        let checked = 0;
        const mismatches = [];
        for (const align of ["inside", "center", "outside"]) {
            for (const shape of [
                {
                    bounds: [16.25, 20.25, 32, 24],
                    radii: [0, 0, 0, 0],
                    width: 4,
                    fa: 1,
                    sa: 1,
                    minimum: 0,
                },
                {
                    bounds: [16.25, 20.25, 32, 24],
                    radii: [5, 5, 5, 5],
                    width: 6,
                    fa: 0.6,
                    sa: 0.5,
                    minimum: 0,
                },
                {
                    bounds: [16.25, 20.25, 32, 24],
                    radii: [0, 3, 7, 2],
                    width: 6,
                    fa: 0.6,
                    sa: 0.5,
                    minimum: 0,
                },
                {
                    bounds: [28.25, 28.25, 8, 6],
                    radii: [2, 2, 2, 2],
                    width: 10,
                    fa: 1,
                    sa: 1,
                    minimum: 0,
                },
                {
                    bounds: [16.25, 20.25, 32, 20],
                    radii: [100, 4, 6, 8],
                    width: 2,
                    fa: 0.25,
                    sa: 0.75,
                    minimum: 0,
                },
                {
                    bounds: [28.25, 24.25, 4, 16],
                    radii: [0, 3, 3, 0],
                    width: 4,
                    fa: 1,
                    sa: 1,
                    minimum: 8,
                },
                {
                    bounds: [16.25, 20.25, 32, 24],
                    radii: [0, 3, 7, 2],
                    width: 12,
                    fa: 1,
                    sa: 0,
                    minimum: 0,
                },
                {
                    bounds: [16.25, 20.25, 32, 24],
                    radii: [4, 4, 4, 4],
                    width: 6,
                    fa: 0,
                    sa: 0.5,
                    minimum: 0,
                },
            ]) {
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
                const image = await globalThis.createImageBitmap(blob),
                    scratch = globalThis.document.createElement("canvas");
                scratch.width = 64 * dpr;
                scratch.height = 64 * dpr;
                const ctx = scratch.getContext("2d");
                ctx.drawImage(image, 0, 0);
                image.close();
                const png = ctx.getImageData(0, 0, 64 * dpr, 64 * dpr).data;
                const bounds = shape.bounds.slice();
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
                const caseErrors = { live: 0, png: 0 },
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
                        for (const [target, data] of [
                            ["live", bytes],
                            ["png", png],
                        ]) {
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
        const overlap = context.getImageData(
            Math.floor(31 * dpr),
            Math.floor(30 * dpr),
            1,
            1
        ).data;
        const overlapError = Math.max(
            Math.abs(overlap[0]),
            Math.abs(overlap[1]),
            Math.abs((overlap[2] * overlap[3]) / 255 - 223),
            Math.abs(overlap[3] - 223)
        );
        return { checked, mismatches, overlapError };
    } finally {
        api.finalize();
        host.remove();
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
