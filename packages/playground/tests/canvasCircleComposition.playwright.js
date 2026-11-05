import { fileURLToPath, URL } from "node:url";
import { expect, test } from "@playwright/test";

const coreSource =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));

for (const dpr of [1, 2]) {
    test(`Canvas collapsed inward circles at DPR ${dpr}`, async ({
        playwright,
        baseURL,
    }) => {
        const browser = await playwright.chromium.launch({
            args: [`--force-device-scale-factor=${dpr}`],
        });
        const page = await browser.newPage({ deviceScaleFactor: dpr });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
            await page.route("**/canvas-circle-proof", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/canvas-circle-proof", baseURL).href);
            const result = await page.evaluate(verifyCanvasCircles, {
                coreSource,
                dpr,
            });
            expect(result.backing).toEqual([64 * dpr, 64 * dpr]);
            expect(result.partialSamples).toBeGreaterThan(20);
            expect(result.maxError).toBeLessThanOrEqual(2);
            expect(result.exteriorAlpha).toBe(0);
            expect(result.retainedErrors).toEqual([0, 0, 0, 0, 0, 0]);
            expect(result.restored).toBe(true);
            expect(result.picks).toEqual(["c", "c"]);
            expect(errors).toEqual([]);
        } finally {
            await browser.close();
        }
    });
}

/** @param {{coreSource: string, dpr: number}} options */
async function verifyCanvasCircles({ coreSource, dpr }) {
    const { embed } = await import(coreSource + "minimal.js");
    await import(coreSource + "rendering/registerCanvas.js");
    const config = {
        background: null,
        view: { stroke: null, strokeWidth: 0 },
    };
    /** @param {string} field @param {string} [type] */
    const field = (field, type = "quantitative") => ({
        field,
        type,
        scale: null,
    });
    const wait = () =>
        new Promise((resolve) =>
            globalThis.requestAnimationFrame(() =>
                globalThis.requestAnimationFrame(resolve)
            )
        );
    /**
     * @param {import("../../core/src/types/embedApi.js").EmbedResult} api
     * @param {HTMLDivElement} host
     */
    async function capture(api, host) {
        const canvas = host.querySelector("canvas");
        const live = Array.from(
            canvas
                .getContext("2d")
                .getImageData(0, 0, canvas.width, canvas.height).data
        );
        const { blob } = await api.imageExport.raster({
            pixelRatio: dpr,
            background: null,
        });
        const image = await globalThis.createImageBitmap(blob);
        const decoded = globalThis.document.createElement("canvas");
        decoded.width = image.width;
        decoded.height = image.height;
        const context = decoded.getContext("2d");
        context.drawImage(image, 0, 0);
        image.close();
        return {
            live,
            png: Array.from(
                context.getImageData(0, 0, decoded.width, decoded.height).data
            ),
            backing: [canvas.width, canvas.height],
        };
    }
    /**
     * @param {number} radius
     * @param {{fill: string | null, stroke: string | null, fillOpacity?: number, strokeOpacity?: number, strokeWidth?: number}} paint
     */
    async function fresh(radius, paint) {
        const host = globalThis.document.createElement("div");
        globalThis.document.body.append(host);
        const api = await embed(
            host,
            {
                width: 64,
                height: 64,
                padding: 0,
                config,
                data: { values: [{}] },
                mark: {
                    type: "point",
                    shape: "circle",
                    filled: true,
                    inwardStroke: true,
                    size: 4 * radius * radius,
                    dx: 0.25,
                    dy: 0.25,
                    semanticZoomFraction: 0,
                },
                encoding: Object.fromEntries(
                    Object.entries(paint).map(([channel, value]) => [
                        channel,
                        { value },
                    ])
                ),
            },
            {
                renderer: "canvas",
                onError: (error) => {
                    throw error;
                },
            }
        );
        try {
            await wait();
            return await capture(api, host);
        } finally {
            api.finalize();
            host.remove();
        }
    }
    let backing;
    let maxError = 0;
    let partialSamples = 0;
    let exteriorAlpha = 0;
    // Fresh native nominal masks are independent of stroke geometry and paint alpha.
    for (const radius of [0.25, 4]) {
        const mask = await fresh(radius, { fill: "white", stroke: null });
        backing = mask.backing;
        for (const [fill, fillOpacity, strokeOpacity, fa, sa] of [
            ["rgba(255,0,0,.8)", 1, 1, 0.8, 0.5],
            ["rgba(255,0,0,.8)", 0.3, 0.4, 0.24, 0.2],
            [null, 1, 1, 0, 0.5],
        ]) {
            const actual = await fresh(radius, {
                fill,
                fillOpacity,
                stroke: "rgba(0,0,255,.5)",
                strokeOpacity,
                strokeWidth: radius * 2,
            });
            const expected = [fa * (1 - sa), 0, sa, sa + fa * (1 - sa)];
            for (const mode of ["live", "png"]) {
                for (let i = 0; i < actual[mode].length; i += 4) {
                    const cf = mask[mode][i + 3] / 255;
                    const alpha = actual[mode][i + 3] / 255;
                    if (cf > 0 && cf < 1) partialSamples++;
                    const x = (i / 4) % (64 * dpr);
                    const y = Math.floor(i / 4 / (64 * dpr));
                    if (
                        Math.hypot(
                            (x + 0.5) / dpr - 32.25,
                            (y + 0.5) / dpr - 31.75
                        ) >
                        radius + 1 / dpr
                    ) {
                        exteriorAlpha = Math.max(
                            exteriorAlpha,
                            actual[mode][i + 3]
                        );
                    }
                    for (let channel = 0; channel < 4; channel++) {
                        const value =
                            channel === 3
                                ? alpha * 255
                                : actual[mode][i + channel] * alpha;
                        maxError = Math.max(
                            maxError,
                            Math.abs(value - cf * expected[channel] * 255)
                        );
                    }
                }
            }
        }
    }
    const rows = [
        { id: "a", x: 0.5, w: 4 },
        { id: "b", x: 16, w: 0 },
        { id: "c", x: 20, w: 4 },
    ];
    const apps = [];
    for (const reference of [false, true]) {
        const host = globalThis.document.createElement("div");
        globalThis.document.body.append(host);
        const api = await embed(
            host,
            {
                width: 64,
                height: 64,
                padding: 0,
                config,
                datasets: { rows: [] },
                opacity: 0.5,
                params: [{ name: "inside", value: true }],
                layer: [
                    {
                        name: "circles",
                        opacity: 0.5,
                        data: { name: "rows" },
                        mark: {
                            type: "point",
                            shape: "circle",
                            filled: true,
                            size: 64,
                            inwardStroke: { expr: "inside" },
                            dx: 0.25,
                            dy: -0.375,
                            clip: true,
                            semanticZoomFraction: 0,
                        },
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: null,
                                scale: {
                                    domain: [0, 64],
                                    nice: false,
                                    zero: false,
                                },
                            },
                            y: { value: 0.5 },
                            fill: field("f", "nominal"),
                            stroke: field("s", "nominal"),
                            fillOpacity: field("fo"),
                            strokeOpacity: field("so"),
                            strokeWidth: field("w"),
                        },
                    },
                ],
            },
            {
                renderer: "canvas",
                onError: (error) => {
                    throw error;
                },
            }
        );
        apps.push({ api, host, reference });
    }
    const retainedErrors = [];
    let first;
    let restored = false;
    const picks = [];
    try {
        // Keep composed → ordinary → composed paints in datum order while changing geometry.
        // The reference fill is premultiplied (.448, 0, .3, .748), converted to straight RGB.
        for (const [width, inside, stroke] of [
            [4, true, "rgba(0,0,255,.5)"],
            [3.99, true, "rgba(0,0,255,.5)"],
            [8, true, "rgba(0,0,255,.5)"],
            [8, false, "rgba(0,0,255,.5)"],
            [4, true, null],
            [4, true, "rgba(0,0,255,.5)"],
        ]) {
            for (const { api, reference } of apps) {
                api.params.get("inside").setValue(inside);
                api.datasets.set(
                    "rows",
                    rows.map((row) => {
                        const eligible =
                            reference &&
                            row.w > 0 &&
                            inside &&
                            width >= 4 &&
                            stroke;
                        return {
                            ...row,
                            w: eligible ? 0 : row.w > 0 ? width : 0,
                            f: eligible
                                ? "rgba(59.89304812834224%,0%,40.10695187165775%,.748)"
                                : "rgba(255,0,0,.8)",
                            s: eligible ? null : stroke,
                            fo: eligible ? 1 : 0.8,
                            so: 0.6,
                        };
                    })
                );
            }
            await wait();
            const frames = await Promise.all(
                apps.map(({ api, host }) => capture(api, host))
            );
            let error = 0;
            for (const mode of ["live", "png"])
                for (let i = 0; i < frames[0][mode].length; i++) {
                    error = Math.max(
                        error,
                        Math.abs(frames[0][mode][i] - frames[1][mode][i])
                    );
                }
            retainedErrors.push(error);
            first ??= frames[0].png;
            restored = first.every((value, i) => value === frames[0].png[i]);
        }
        for (const { api } of apps) {
            const hit = await api.views
                .get({ scope: [], view: "circles" })
                .marks.pick({ x: 20.25, y: 32.375 });
            picks.push(hit.status === "hit" ? hit.hit.datum.id : hit.status);
        }
    } finally {
        for (const { api, host } of apps) {
            api.finalize();
            host.remove();
        }
    }
    return {
        backing,
        maxError,
        partialSamples,
        exteriorAlpha,
        retainedErrors,
        restored,
        picks,
    };
}
