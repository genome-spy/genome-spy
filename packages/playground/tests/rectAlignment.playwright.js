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
            expect(result.pngMatches).toBe(true);
            expect(result.transparentMatches).toBe(true);
            expect(errors).toEqual([]);
        } finally {
            await browser.close();
        }
    });
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
        let checked = 0,
            pngMatches = true,
            transparentMatches = true;
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
                    bounds: [28.25, 24.25, 4, 16],
                    radii: [0, 3, 3, 0],
                    width: 4,
                    fa: 1,
                    sa: 1,
                    minimum: 8,
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
                    error = 0,
                    worst;
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
                        const i = (py * 64 * dpr + px) * 4,
                            alpha = bytes[i + 3];
                        const actual = [
                            (bytes[i] * alpha) / 255,
                            (bytes[i + 1] * alpha) / 255,
                            (bytes[i + 2] * alpha) / 255,
                            alpha,
                        ];
                        const pixelError = Math.max(
                            ...actual.map((value, c) =>
                                Math.abs(value - expected[c])
                            )
                        );
                        if (pixelError > error) {
                            error = pixelError;
                            worst = { x, y, actual, expected };
                        }
                        checked++;
                        caseChecked++;
                    }
                if (caseChecked < 100 || error > 2)
                    mismatches.push({
                        align,
                        shape,
                        error,
                        caseChecked,
                        worst,
                    });
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
                pngMatches &&= bytes.every((value, i) => value === png[i]);
            }
            const bounds = [16.25, 20.25, 32, 24],
                values = {
                    align,
                    tl: 0,
                    tr: 3,
                    br: 7,
                    bl: 2,
                    fa: 1,
                    sa: 0,
                    minimum: 0,
                };
            const plain = await paint({ ...values, width: 0 }, bounds),
                stroked = await paint({ ...values, width: 12 }, bounds);
            transparentMatches &&= plain.every(
                (value, i) => value === stroked[i]
            );
        }
        return { checked, mismatches, pngMatches, transparentMatches };
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
