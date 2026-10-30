import { fileURLToPath, URL } from "node:url";
import { expect, test } from "@playwright/test";

const core =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));
for (const dpr of [1, 2]) {
    test(`WebGL points at DPR ${dpr}`, async ({ playwright, baseURL }) => {
        const browser = await playwright.chromium.launch({
            args: [
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                `--force-device-scale-factor=${dpr}`,
            ],
        });
        const page = await browser.newPage({ deviceScaleFactor: dpr });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
            await page.route("**/point-proof.html", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/point-proof.html", baseURL).href);
            const result = await page.evaluate(renderPoints, { dpr, core });
            for (const [actual, expected] of result.samples)
                actual.forEach((v, i) =>
                    expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(2)
                );
            expect(result.controls.every(Boolean)).toBe(true);
            expect(result.minimum).toEqual([[0, 0, 0, 0], "A", "A", null]);
            expect(result.before).toEqual([
                "circle",
                "X",
                "PLUS",
                "edge",
                null,
            ]);
            expect(result.after).toEqual([null, "X2", "PLUS2", "edge2", null]);
            expect(result.clipped).toEqual([0, 0, 0, 0]);
            expect(result.overlap).toEqual([[0, 0, 255, 255], "last"]);
            expect(result.glError).toBe(0);
            expect(errors).toEqual([]);
        } finally {
            await browser.close();
        }
    });
}

/** @param {{dpr: number, core: string}} options */
async function renderPoints({ dpr, core }) {
    // Preserve submitted pixels; use real Core normalization, shaders and picking.
    const original = globalThis.HTMLCanvasElement.prototype.getContext;
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
    const { embed } = await import(core + "minimal.js");
    await import(core + "rendering/registerWebGL.js");
    const host = globalThis.document.body;
    const values = {
        size: 256,
        strokeWidth: 0,
        strokeOpacity: 1,
        fillOpacity: 1,
        inwardStroke: false,
        angle: 0,
        minPickingSize: 0,
    };
    const encoding = Object.fromEntries(
        ["x", "y"].map((field) => [
            field,
            {
                field,
                type: "quantitative",
                scale: { domain: [0, 64], nice: false, zero: false },
                axis: null,
            },
        ])
    );
    const shapes = ["circle", "square", "x", "+", "triangle-up"];
    const api = await embed(
        host,
        {
            padding: 0,
            spacing: 0,
            config: { background: null },
            datasets: { rows: [] },
            params: Object.entries(values).map(([name, value]) => ({
                name,
                value,
            })),
            hconcat: [
                {
                    name: "records",
                    width: 64,
                    height: 64,
                    data: { name: "rows" },
                    mark: {
                        type: "point",
                        filled: true,
                        tooltip: false,
                        stroke: "blue",
                        clip: true,
                        ...Object.fromEntries(
                            Object.keys(values).map((name) => [
                                name,
                                { expr: name },
                            ])
                        ),
                    },
                    encoding: {
                        ...encoding,
                        shape: {
                            field: "shape",
                            type: "nominal",
                            scale: { domain: shapes, range: shapes },
                            legend: null,
                        },
                        fill: {
                            legend: null,
                            field: "fill",
                            type: "nominal",
                            scale: {
                                domain: ["red", "blue"],
                                range: ["red", "blue"],
                            },
                        },
                    },
                },
                { width: 16, height: 64, data: { values: [] }, mark: "point" },
            ],
        },
        { renderer: "webgl" }
    );
    const frames = () =>
        new Promise((resolve) =>
            globalThis.requestAnimationFrame(() =>
                globalThis.requestAnimationFrame(resolve)
            )
        );
    const view = api.views.get({ scope: [], view: "records" }),
        bounds = api.views.getLayoutBounds(view);
    const canvas = host.querySelector("canvas"),
        gl = canvas.getContext("webgl2");
    const read = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const b = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            b
        );
        return b;
    };
    /** @param {Uint8Array} b @param {number} x */
    const pixel = (b, x) => {
        const i =
            ((canvas.height - 1 - Math.floor((bounds.y + 32) * dpr)) *
                canvas.width +
                Math.floor((bounds.x + x) * dpr)) *
            4;
        return Array.from(b.slice(i, i + 4));
    };
    /** @param {number} x */
    const pick = async (x) => {
        const h = await view.marks.pick({ x: bounds.x + x, y: bounds.y + 32 });
        return h.status === "hit" ? h.hit.datum.id : null;
    };
    /** @param {object} next @param {object[]} [rows] */
    const update = async (next, rows) => {
        for (const [name, value] of Object.entries(next))
            api.params.get(name).setValue(value);
        if (rows) api.datasets.set("rows", rows);
        await frames();
    };
    /** @param {string} shape */
    const point = (shape) => [
        {
            id: "A",
            shape,
            fill: "red",
            x: 31.5 + 0.5 / dpr,
            y: 32.5 - 0.5 / dpr,
        },
    ];
    const samples = [],
        controls = [];
    try {
        for (const shape of ["circle", "square"]) {
            // Integer point size removes raster rounding: local p=(8,0), Ci=Cf-.125, Co=Cf+.125.
            const k = shape === "circle" ? 1 : Math.sqrt(3),
                w = 0.25 / dpr,
                cf = 0.5 - 0.125 * k;
            await update(
                {
                    size: (16 - w * k) ** 2,
                    strokeWidth: w,
                    strokeOpacity: 1,
                    fillOpacity: 1,
                    inwardStroke: false,
                },
                point(shape)
            );
            samples.push([
                pixel(read(), 40),
                [(cf - 0.125) * 255, 0, 64, (cf + 0.125) * 255],
            ]);
            await update({ strokeOpacity: 0.5 });
            samples.push([
                pixel(read(), 40),
                [(cf - 0.0625) * 255, 0, 32, (cf + 0.0625) * 255],
            ]);
            await update({ fillOpacity: 0 });
            samples.push([pixel(read(), 40), [0, 0, 32, 32]]);
            await update({
                size: 256,
                strokeWidth: 0.25 / dpr,
                strokeOpacity: 1,
                fillOpacity: 1,
                inwardStroke: true,
            });
            samples.push([pixel(read(), 40), [64, 0, 64, 128]]);
            await update({ strokeWidth: 20, strokeOpacity: 0.5 });
            for (const [x, expected] of [
                [40, [64, 0, 64, 128]],
                [32, [128, 0, 128, 255]],
                [38, [128, 0, 128, 255]],
            ])
                samples.push([pixel(read(), x), expected]);
            await update({ strokeWidth: 0 });
            const baseline = read();
            await update({ strokeWidth: 4, strokeOpacity: 0 });
            controls.push(read().every((v, i) => v === baseline[i]));
        }
        for (const shape of ["x", "+"]) {
            await update(
                { strokeWidth: 1, strokeOpacity: 0, inwardStroke: false },
                point(shape)
            );
            const thin = read();
            await update({ strokeWidth: 4 });
            const thick = read();
            await update({ strokeOpacity: 1 });
            const blue = read();
            controls.push(
                thick.every(
                    (v, i) =>
                        v === blue[i + (i % 4 === 0 ? 2 : i % 4 === 2 ? -2 : 0)]
                )
            );
            controls.push(
                thick.filter((v, i) => i % 4 === 3 && v > 0).length >
                    thin.filter((v, i) => i % 4 === 3 && v > 0).length
            );
        }
        await update(
            { size: 4, minPickingSize: 12, strokeWidth: 0 },
            point("circle")
        );
        const minimum = [
            pixel(read(), 35),
            await pick(32),
            await pick(35),
            await pick(39),
        ];
        /** @param {Array<[string,string,number,string]>} tuples */
        const rows = (tuples) =>
            tuples.map(([id, shape, x, fill]) => ({
                id,
                shape,
                x,
                y: 32,
                fill,
            }));
        await update(
            { size: 256, minPickingSize: 0, strokeWidth: 2, strokeOpacity: 0 },
            rows([
                ["circle", "circle", 8, "red"],
                ["X", "x", 24, "red"],
                ["PLUS", "+", 40, "red"],
                ["edge", "triangle-up", 62, "red"],
            ])
        );
        const before = await Promise.all([8, 24, 40, 62, 66].map(pick));
        await update(
            { strokeWidth: 4, angle: 30 },
            rows([
                ["X2", "+", 24, "red"],
                ["PLUS2", "x", 40, "red"],
                ["edge2", "triangle-up", 62, "red"],
            ])
        );
        const after = await Promise.all([8, 24, 40, 62, 66].map(pick)),
            clipped = pixel(read(), 66);
        await update(
            {},
            rows([
                ["first", "circle", 32, "red"],
                ["last", "circle", 32, "blue"],
            ])
        );
        return {
            samples,
            controls,
            minimum,
            before,
            after,
            clipped,
            overlap: [pixel(read(), 32), await pick(32)],
            glError: gl.getError(),
        };
    } finally {
        api.finalize();
    }
}
