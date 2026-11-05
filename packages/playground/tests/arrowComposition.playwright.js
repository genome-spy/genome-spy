import { fileURLToPath, URL } from "node:url";
import { expect, test } from "@playwright/test";

const coreSource =
    "/@fs" + fileURLToPath(new URL("../../core/src/", import.meta.url));

for (const dpr of [1, 2]) {
    test(`WebGL arrow composition at DPR ${dpr}`, async ({
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
            await page.route("**/arrow-proof.html", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/arrow-proof.html", baseURL).href);
            const result = await page.evaluate(renderArrows, {
                dpr,
                entry: coreSource + "minimal.js",
                registration: coreSource + "rendering/registerWebGL.js",
            });
            expect(errors).toEqual([]);
            expect(result.size).toEqual([64 * dpr, 64 * dpr]);
            expect(result.glError).toBe(0);
            for (const [actual, expected] of result.samples) {
                actual.forEach((v, i) =>
                    expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(2)
                );
            }
            expect(Math.max(...result.transparentErrors)).toBeLessThanOrEqual(
                2
            );
            expect(result.overlapAlpha).toBe(255);
            expect(result.overlapPicks).toEqual(["arrow", "arrow", "empty"]);
            expect(Math.max(...result.repeatErrors)).toBeLessThanOrEqual(1);
            expect(result.referenceError).toBeLessThanOrEqual(2);
            expect(result.referenceCoverage.every((count) => count > 0)).toBe(
                true
            );
            expect(result.repeatPicks).toEqual([
                "arrow",
                "arrow",
                "arrow",
                "empty",
            ]);
            expect(result.picks).toEqual(["arrow", "empty", "empty"]);
            expect(result.opacityErrors.every((error) => error <= 2)).toBe(
                true
            );
        } finally {
            await browser.close();
        }
    });
}

/** @param {{dpr: number, entry: string, registration: string}} options */
async function renderArrows({ dpr, entry, registration }) {
    // Read the submitted framebuffer without substituting any rendering logic.
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
    const { embed } = await import(entry);
    await import(registration);
    const host = globalThis.document.createElement("div");
    host.style.cssText = "width:64px;height:64px";
    globalThis.document.body.append(host);
    /** @param {string} field */
    const position = (field) => ({
        field,
        type: "quantitative",
        scale: { domain: [0, 64], nice: false, zero: false },
        axis: null,
    });
    const cy = 32.5 - 0.5 / dpr;
    const api = await embed(
        host,
        {
            name: "arrow",
            opacity: { expr: "viewOpacity" },
            width: 64,
            height: 64,
            padding: 0,
            config: { background: null },
            datasets: {
                arrows: [{ id: "arrow", x: 8, x2: 56, y: cy, y2: cy }],
            },
            data: { name: "arrows" },
            params: Object.entries({
                size: 8 - 0.25 / dpr,
                width: 0.25 / dpr,
                fillAlpha: 1,
                strokeAlpha: 1,
                head: "triangle",
                viewOpacity: 1,
                stem: true,
                spacing: null,
                direction: "forward",
            }).map(([name, value]) => ({ name, value })),
            mark: {
                type: "arrow",
                tooltip: false,
                filled: true,
                fill: "red",
                stroke: "blue",
                size: { expr: "size" },
                strokeWidth: { expr: "width" },
                fillOpacity: { expr: "fillAlpha" },
                strokeOpacity: { expr: "strokeAlpha" },
                headShape: { expr: "head" },
                stem: { expr: "stem" },
                headWidth: 2,
                headSpacing: { expr: "spacing" },
                direction: { expr: "direction" },
            },
            encoding: {
                x: position("x"),
                x2: { field: "x2" },
                y: position("y"),
                y2: { field: "y2" },
            },
        },
        {
            renderer: "webgl",
            onError: (error) => {
                throw error;
            },
        }
    );
    const canvas = host.querySelector("canvas"),
        gl = canvas.getContext("webgl2");
    /** @param {object} [values] */
    const paint = async (values = {}) => {
        for (const [key, value] of Object.entries(values))
            api.params.get(key).setValue(value);
        await new Promise((resolve) =>
            globalThis.requestAnimationFrame(() =>
                globalThis.requestAnimationFrame(resolve)
            )
        );
        const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const bytes = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bytes
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
        return bytes;
    };
    /** @param {Uint8Array} bytes @param {number} [y] */
    const pixel = (bytes, y = 36) => {
        const i = ((canvas.height - 1 - y * dpr) * canvas.width + 32 * dpr) * 4;
        return Array.from(bytes.slice(i, i + 4));
    };
    try {
        // Away from head/notch edges: Ci=.25, Cf=.375, Co=.5.
        const samples = [[pixel(await paint()), [64, 0, 64, 128]]];
        samples.push([
            pixel(await paint({ fillAlpha: 0.8, strokeAlpha: 0.5 })),
            [64, 0, 32, 96],
        ]);
        const wide = await paint({ size: 8, width: 20, fillAlpha: 1 });
        samples.push(
            [pixel(wide), [64, 0, 128, 191]],
            [pixel(wide, 32), [128, 0, 128, 255]]
        );
        const opacityErrors = [];
        for (const head of ["triangle", "open"]) {
            const full = await paint({
                head,
                stem: head === "triangle",
                size: 8,
                width: 8,
                fillAlpha: 0.6,
                strokeAlpha: 0.5,
                viewOpacity: 1,
            });
            const faded = await paint({ viewOpacity: 0.5 });
            opacityErrors.push(
                faded.reduce(
                    (error, value, i) =>
                        Math.max(error, Math.abs(value - full[i] * 0.5)),
                    0
                )
            );
        }
        // Filled-stem overlap: opaque blue must remain blue under a common fade.
        samples.push([
            pixel(
                await paint({
                    head: "triangle",
                    stem: true,
                    width: 20,
                    fillAlpha: 1,
                    strokeAlpha: 1,
                }),
                32
            ),
            [0, 0, 128, 128],
        ]);
        await paint({ viewOpacity: 1, strokeAlpha: 0.5 });
        const transparentErrors = [];
        for (const head of ["triangle", "open"]) {
            const nominal = await paint({
                head,
                stem: head === "triangle",
                size: 8,
                width: 0,
            });
            const transparent = await paint({ width: 4, strokeAlpha: 0 });
            transparentErrors.push(
                transparent.reduce(
                    (max, v, i) => Math.max(max, Math.abs(v - nominal[i])),
                    0
                )
            );
        }
        await paint({ width: 1, strokeAlpha: 1, viewOpacity: 0.5 });
        const view = api.views.get({ scope: [], view: "arrow" });
        const bounds = api.views.getLayoutBounds(view),
            picks = [];
        for (const [x, y] of [
            [50.5, 34 + 0.5 / dpr],
            [42.5, 32 + 0.5 / dpr],
            [0, 0],
        ]) {
            const hit = await view.marks.pick({
                x: bounds.x + x,
                y: bounds.y + y,
            });
            picks.push(hit.status === "hit" ? hit.hit.datum.id : hit.status);
        }
<<<<<<< HEAD
        // A later head's empty quad overlaps an earlier head's opaque border.
        const spacing = 8 + 8 / Math.SQRT2;
        api.datasets.set(
            "arrows",
            Array.from({ length: 3 }, (_, i) => ({
                id: "arrow",
                x: 8,
                x2: 56 - i * spacing,
                y: cy,
                y2: cy,
            }))
        );
        const overlapping = await paint({
            viewOpacity: 1,
=======
        const repeatErrors = [];
        for (const head of ["triangle", "open"]) {
            for (const direction of ["forward", "reverse"]) {
                const nominal = await paint({
                    head,
                    direction,
                    stem: false,
                    spacing: 0.5,
                    width: 0,
                });
                for (const width of [4, 24]) {
                    const transparent = await paint({ width, strokeAlpha: 0 });
                    repeatErrors.push(
                        transparent.reduce(
                            (max, v, i) =>
                                Math.max(max, Math.abs(v - nominal[i])),
                            0
                        )
                    );
                }
            }
        }
        const actual = await paint({
>>>>>>> origin/codex/webgl-arrow-picking-coverage
            head: "open",
            direction: "forward",
            width: 24,
            strokeAlpha: 1,
        });
        const pickRepeats = async () => {
            const hits = [];
            for (const [x, y] of [
                [7, 32],
                [40, 42],
                [57, 32],
                [0, 0],
            ]) {
                const hit = await view.marks.pick({
                    x: bounds.x + x,
                    y: bounds.y + y,
                });
                hits.push(hit.status === "hit" ? hit.hit.datum.id : hit.status);
            }
            return hits;
        };
        const repeatPicks = await pickRepeats();
        const spacing = 8 + 8 / Math.SQRT2;
        api.datasets.set(
            "arrows",
            Array.from(
                { length: Math.floor((48 - spacing) / spacing) + 1 },
                (_, i) => ({
                    id: "arrow",
                    x: 8,
                    x2: 56 - i * spacing,
                    y: cy,
                    y2: cy,
                })
            )
        );
        const expected = await paint({ spacing: null });
        let referenceError = 0,
            foreground = 0,
            background = 0;
        // Independent heads are an opaque geometry oracle away from AA overlaps.
        for (let y = 1; y < canvas.height - 1; y++) {
            for (let x = 1; x < canvas.width - 1; x++) {
                const i = (y * canvas.width + x) * 4 + 3,
                    alpha = expected[i];
                if (alpha !== 0 && alpha !== 255) continue;
                let stable = true;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (
                            expected[i + (dy * canvas.width + dx) * 4] !== alpha
                        )
                            stable = false;
                    }
                }
                if (stable) {
                    if (alpha === 255) foreground++;
                    else background++;
                    referenceError = Math.max(
                        referenceError,
                        Math.abs(actual[i] - alpha)
                    );
                }
            }
        }
        // The independent heads also exercise an empty later quad overlapping
        // an earlier opaque border. Reuse the geometry oracle scene above.
        const overlapAlpha =
            expected[
                ((canvas.height - 1 - 42 * dpr) * canvas.width + 40 * dpr) * 4 +
                    3
            ];
        const overlapPicks = [];
        for (const strokeAlpha of [1, 0]) {
            await paint({ strokeAlpha });
            const hit = await view.marks.pick({
                x: bounds.x + 40,
                y: bounds.y + 42,
            });
            overlapPicks.push(
                hit.status === "hit" ? hit.hit.datum.id : hit.status
            );
        }
        overlapPicks.push(
            (await view.marks.pick({ x: bounds.x, y: bounds.y })).status
        );
        return {
            overlapAlpha,
            overlapPicks,
            referenceError,
            referenceCoverage: [foreground, background],
            repeatPicks,
            repeatErrors,
            samples,
            transparentErrors,
            opacityErrors,
            picks,
            size: [canvas.width, canvas.height],
            glError: gl.getError(),
        };
    } finally {
        api.finalize();
        host.remove();
    }
}
