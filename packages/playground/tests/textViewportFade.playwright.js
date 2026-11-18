import { fileURLToPath, URL } from "node:url";
import { expect, test } from "@playwright/test";

const core =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));
for (const dpr of [1, 2]) {
    test(`WebGL text opposing viewport fades at DPR ${dpr}`, async ({
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
            await page.route("**/text-fade-proof.html", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/text-fade-proof.html", baseURL).href);
            const result = await page.evaluate(renderTextFade, { core, dpr });
            expect(result.maxError).toBeLessThanOrEqual(2);
            expect(result.referenceInk).toBeGreaterThan(100);
            expect(result.centerVisible).toBeGreaterThan(100);
            expect(result.controls.every(Boolean)).toBe(true);
            expect(result.picking.every(Boolean)).toBe(true);
            expect(errors).toEqual([]);
        } finally {
            await browser.close();
        }
    });
}

/** @param {{core: string, dpr: number}} options */
async function renderTextFade({ core, dpr }) {
    // Read the actual submitted framebuffer without replacing any rendering logic.
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
    let maxError = 0,
        referenceInk = 0,
        centerVisible = 0;
    const controls = [],
        picking = [];
    // Representative placement modes; the external proof covers the full matrix.
    for (const { ranged, angle, axis } of [
        { ranged: false, angle: 0, axis: 0 },
        { ranged: false, angle: 31, axis: 1 },
        { ranged: true, angle: 31, axis: 0 },
    ]) {
        const api = await embed(
            host,
            {
                name: "records",
                width: 128,
                height: 128,
                padding: 0,
                config: { background: null },
                params: [
                    { name: "axis", value: axis },
                    { name: "angle", value: angle },
                    { name: "fadeWidth", value: 32 },
                    { name: "fadeDistance", value: -Infinity },
                ],
                data: { values: [{ id: "glyph", label: "W" }] },
                mark: {
                    type: "text",
                    size: 160,
                    color: "white",
                    align: "center",
                    baseline: "middle",
                    angle: { expr: "angle" },
                    tooltip: false,
                    viewportEdgeFadeWidthLeft: { expr: "fadeWidth" },
                    viewportEdgeFadeWidthRight: { expr: "fadeWidth" },
                    viewportEdgeFadeDistanceLeft: {
                        expr: "axis===0?fadeDistance:-1e20",
                    },
                    viewportEdgeFadeDistanceRight: {
                        expr: "axis===0?fadeDistance:-1e20",
                    },
                    viewportEdgeFadeWidthTop: { expr: "fadeWidth" },
                    viewportEdgeFadeWidthBottom: { expr: "fadeWidth" },
                    viewportEdgeFadeDistanceTop: {
                        expr: "axis===1?fadeDistance:-1e20",
                    },
                    viewportEdgeFadeDistanceBottom: {
                        expr: "axis===1?fadeDistance:-1e20",
                    },
                },
                encoding: {
                    key: { field: "id" },
                    text: { field: "label" },
                    x: { value: ranged ? 0.1 : 0.5 },
                    ...(ranged ? { x2: { value: 0.9 } } : {}),
                    y: { value: 0.5 },
                },
            },
            { renderer: "webgl" }
        );
        const canvas = host.querySelector("canvas"),
            gl = canvas.getContext("webgl2");
        if (canvas.width !== 128 * dpr) throw Error("backing size");
        const view = api.views.get({ scope: [], view: "records" });
        const read = () => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                gl.readPixels(
                    0,
                    0,
                    canvas.width,
                    canvas.height,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    pixels
                );
                return pixels;
            },
            settle = () =>
                new Promise((r) =>
                    globalThis.requestAnimationFrame(() =>
                        globalThis.requestAnimationFrame(r)
                    )
                );
        try {
            api.params.get("fadeDistance").setValue(-Infinity);
            await settle();
            const ref = read();
            const pick = async (/** @type {number} */ x) => {
                const hit = await view.marks.pick({ x, y: 64 });
                return hit.status === "hit" ? hit.hit.datum.id : null;
            };
            const sampleX = [8, 32, 64, 96, 120];
            const expectedPicks = [];
            for (const x of sampleX) expectedPicks.push(await pick(x));
            for (const [width, distance] of [
                [32, 16],
                [24, 8],
            ]) {
                api.params.get("fadeWidth").setValue(width);
                api.params.get("fadeDistance").setValue(distance);
                await settle();
                const actual = read();
                for (let y = 0; y < canvas.height; y++)
                    for (let x = 0; x < canvas.width; x++) {
                        const index = (y * canvas.width + x) * 4;
                        // Existing raster placement shifts drawing right and down by 0.5px.
                        const px =
                                axis === 0
                                    ? (x + 0.5) / dpr - 0.5
                                    : (y + 0.5) / dpr + 0.5,
                            fade = Math.max(
                                0,
                                Math.min(
                                    1,
                                    (px - distance) / width,
                                    (128 - px - distance) / width
                                )
                            );
                        // White-text gamma follows coverage times fade.
                        const expected = ref[index + 3] * Math.pow(fade, 0.75);
                        maxError = Math.max(
                            maxError,
                            Math.abs(actual[index + 3] - expected)
                        );
                        if (ref[index + 3] > 10) referenceInk++;
                        if (fade === 1 && actual[index + 3] > 10)
                            centerVisible++;
                    }
                for (const [i, x] of sampleX.entries()) {
                    picking.push((await pick(x)) === expectedPicks[i]);
                }
            }
            api.params.get("fadeDistance").setValue(-Infinity);
            await settle();
            controls.push(read().every((v, i) => v === ref[i]));
            if (gl.getError()) throw Error("GL error");
        } finally {
            api.finalize();
            host.replaceChildren();
        }
    }
    return { maxError, referenceInk, centerVisible, controls, picking };
}
