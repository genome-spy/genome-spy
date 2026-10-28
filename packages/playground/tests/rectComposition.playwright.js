import { fileURLToPath, URL } from "node:url";
import { expect, test } from "@playwright/test";

for (const dpr of [1, 2]) {
    test(`WebGL rectangle composition at DPR ${dpr}`, async ({
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
        const context = await browser.newContext({ deviceScaleFactor: dpr });
        const page = await context.newPage();
        try {
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.route("**/rect-proof.html", (route) =>
                route.fulfill({
                    contentType: "text/html",
                    body: "<body style='margin:0'></body>",
                })
            );
            await page.goto(new URL("/rect-proof.html", baseURL).href);
            const result = await page.evaluate(
                async ({ dpr, entry, registration }) => {
                    // Preserve the live framebuffer for readback without replacing shader/render logic.
                    const original =
                        globalThis.HTMLCanvasElement.prototype.getContext;
                    globalThis.HTMLCanvasElement.prototype.getContext =
                        function (type, options) {
                            return original.call(
                                this,
                                type,
                                type === "webgl2"
                                    ? {
                                          ...options,
                                          preserveDrawingBuffer: true,
                                      }
                                    : options
                            );
                        };
                    const { embed } = await import(entry);
                    await import(registration);
                    const host = globalThis.document.createElement("div");
                    host.style.cssText = "width:64px;height:64px";
                    globalThis.document.body.append(host);
                    const position = (field) => ({
                        field,
                        type: "quantitative",
                        scale: { domain: [0, 64], nice: false, zero: false },
                        axis: null,
                    });
                    const row = { id: "A", x: 16, x2: 48, y: 16, y2: 48 };
                    const api = await embed(
                        host,
                        {
                            name: "rect",
                            width: 64,
                            height: 64,
                            padding: 0,
                            opacity: { expr: "viewFade" },
                            config: { background: null },
                            datasets: { rows: [row] },
                            data: { name: "rows" },
                            params: [
                                { name: "viewFade", value: 1 },
                                { name: "width", value: 0 },
                                { name: "alpha", value: 0 },
                                { name: "radius", value: 0 },
                                { name: "minimum", value: 0 },
                                { name: "floor", value: 0 },
                                { name: "shadow", value: 0 },
                                { name: "hatch", value: "none" },
                            ],
                            mark: {
                                type: "rect",
                                tooltip: false,
                                fill: "red",
                                stroke: "blue",
                                strokeWidth: { expr: "width" },
                                strokeOpacity: { expr: "alpha" },
                                cornerRadius: { expr: "radius" },
                                minWidth: { expr: "minimum" },
                                minHeight: { expr: "minimum" },
                                minOpacity: { expr: "floor" },
                                shadowOpacity: { expr: "shadow" },
                                shadowColor: "lime",
                                shadowOffsetX: 8,
                                shadowBlur: 2,
                                hatch: { expr: "hatch" },
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
                    const view = api.views.get({ scope: [], view: "rect" });
                    const frames = () =>
                        new Promise((resolve) =>
                            globalThis.requestAnimationFrame(() =>
                                globalThis.requestAnimationFrame(resolve)
                            )
                        );
                    const paint = async (values = {}) => {
                        for (const [name, value] of Object.entries(values))
                            api.params.get(name).setValue(value);
                        await frames();
                        const previous = gl.getParameter(
                            gl.FRAMEBUFFER_BINDING
                        );
                        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                        const bytes = new Uint8Array(
                            canvas.width * canvas.height * 4
                        );
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
                    const pixel = (bytes, x, y) => {
                        const offset =
                            ((canvas.height - 1 - Math.floor(y * dpr)) *
                                canvas.width +
                                Math.floor(x * dpr)) *
                            4;
                        return Array.from(bytes.slice(offset, offset + 4));
                    };
                    try {
                        const transparentErrors = [];
                        for (const radius of [0, 6]) {
                            const baseline = await paint({
                                radius,
                                width: 0,
                                alpha: 0,
                            });
                            for (const width of [0.25 / dpr, 4, 40]) {
                                const actual = await paint({ width });
                                transparentErrors.push(
                                    actual.reduce(
                                        (m, v, i) =>
                                            Math.max(
                                                m,
                                                Math.abs(v - baseline[i])
                                            ),
                                        0
                                    )
                                );
                            }
                        }
                        await paint({ radius: 0, width: 4, alpha: 0.5 });
                        const blend = pixel(await paint(), 17, 32);
                        const viewFade = pixel(
                            await paint({ alpha: 1, viewFade: 0.5 }),
                            17,
                            32
                        );
                        await paint({ viewFade: 1 });
                        const hatch = pixel(
                            await paint({ alpha: 0, hatch: "diagonal" }),
                            32,
                            32
                        );
                        await paint({ hatch: "none", alpha: 1, minimum: 8 });
                        const fades = [];
                        for (const axis of ["x", "y"]) {
                            api.datasets.set("rows", [
                                { ...row, [axis + "2"]: 20 },
                            ]);
                            fades.push(
                                pixel(
                                    await paint(),
                                    axis === "x" ? 15 : 32,
                                    axis === "y" ? 49 : 32
                                )
                            );
                        }
                        const floor = pixel(
                            await paint({ floor: 0.75 }),
                            32,
                            49
                        );
                        api.datasets.set("rows", [row]);
                        await paint({
                            minimum: 0,
                            floor: 0,
                            shadow: 0.5,
                            alpha: 0,
                        });
                        const shadowOnly = pixel(
                            await paint(),
                            49 + (dpr - 1) * 0.5,
                            32
                        );
                        const shadowOver = pixel(
                            await paint({ alpha: 0.5 }),
                            49 + (dpr - 1) * 0.5,
                            32
                        );
                        api.datasets.set("rows", [
                            row,
                            { ...row, id: "B", x: 24, x2: 56 },
                        ]);
                        const overlap = pixel(
                            await paint({ shadow: 0 }),
                            47,
                            32
                        );
                        const picked = await view.marks.pick({ x: 40, y: 32 });
                        const outside = await view.marks.pick({ x: 10, y: 32 });
                        return {
                            transparentErrors,
                            viewFade,
                            blend,
                            hatch,
                            fades,
                            floor,
                            shadowOnly,
                            shadowOver,
                            overlap,
                            picked:
                                picked.status === "hit"
                                    ? picked.hit.datum.id
                                    : picked.status,
                            outside: outside.status,
                            size: [canvas.width, canvas.height],
                            glError: gl.getError(),
                        };
                    } finally {
                        api.finalize();
                        host.remove();
                    }
                },
                {
                    dpr,
                    entry:
                        "/@fs" +
                        fileURLToPath(
                            new URL(
                                "../../core/src/minimal.js",
                                import.meta.url
                            )
                        ),
                    registration:
                        "/@fs" +
                        fileURLToPath(
                            new URL(
                                "../../core/src/rendering/registerWebGL.js",
                                import.meta.url
                            )
                        ),
                }
            );
            expect(errors).toEqual([]);
            expect(result.size).toEqual([64 * dpr, 64 * dpr]);
            expect(result.glError).toBe(0);
            expect(Math.max(...result.transparentErrors)).toBeLessThanOrEqual(
                2
            );
            const close = (actual, expected) =>
                actual.forEach((value, i) =>
                    expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(2)
                );
            close(result.blend, [128, 0, 128, 255]);
            close(result.viewFade, [0, 0, 128, 128]);
            close(result.hatch, [255, 0, 0, 255]);
            for (const fade of result.fades) close(fade, [0, 0, 128, 128]);
            close(result.floor, [0, 0, 191, 191]);
            expect(result.shadowOnly[1]).toBeGreaterThan(0);
            close(result.shadowOver, [
                0,
                result.shadowOnly[1] * 0.5,
                128,
                128 + result.shadowOnly[3] * 0.5,
            ]);
            expect(result.overlap).toEqual([255, 0, 0, 255]);
            expect(result.picked).toBe("B");
            expect(result.outside).toBe("empty");
        } finally {
            await browser.close();
        }
    });
}
