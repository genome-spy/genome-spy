import { fileURLToPath, URL } from "node:url";
import { expect, test } from "playwright/test";

const coreSource = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));

test("WebGL draws and picks tracks with shared x and y scale uniforms", async ({
    playwright,
    baseURL,
}) => {
    const browser = await playwright.chromium.launch({
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/shared-scale.html", (route) =>
            route.fulfill({ contentType: "text/html", body: "<body></body>" })
        );
        await page.goto(new URL("/shared-scale.html", baseURL).href);

        const result = await page.evaluate(async (entry) => {
            const gl = globalThis.WebGL2RenderingContext.prototype;
            const bind = gl.uniformBlockBinding;
            const clear = gl.clear;
            const blocks = new Set();
            let visibleFrames = 0;
            gl.uniformBlockBinding = function (program, index, point) {
                const name = this.getActiveUniformBlockName(program, index);
                if (name?.startsWith("SharedScale_"))
                    blocks.add(`${name}:${point}`);
                return bind.call(this, program, index, point);
            };
            gl.clear = function (mask) {
                if (
                    mask & this.COLOR_BUFFER_BIT &&
                    !this.getParameter(this.DRAW_FRAMEBUFFER_BINDING)
                )
                    visibleFrames++;
                return clear.call(this, mask);
            };
            const settle = () =>
                new Promise((resolve) =>
                    globalThis.requestAnimationFrame(() =>
                        globalThis.requestAnimationFrame(resolve)
                    )
                );

            const { embed } = await import(entry + "index.js");
            await import(entry + "rendering/registerWebGL.js");
            const host = globalThis.document.createElement("div");
            host.style.cssText = "width:256px;height:240px";
            globalThis.document.body.append(host);

            const start = 2 ** 26;
            const track = (name, offset, independent = false) => ({
                name,
                height: 52,
                resolve: independent ? { scale: { x: "excluded" } } : undefined,
                data: {
                    values: [
                        {
                            start: offset + 16,
                            end: offset + 32,
                            row: "a",
                            id: name,
                        },
                    ],
                },
                mark: { type: "rect", color: "#ff0000" },
                encoding: {
                    // Secondary endpoints can precede their primary in the spec.
                    x2: { field: "end" },
                    x: {
                        field: "start",
                        type: "index",
                        axis: null,
                        scale: independent ? { domain: [0, 63] } : undefined,
                    },
                    y2: { field: "row", band: 1 },
                    y: { field: "row", type: "nominal", axis: null, band: 0 },
                },
            });
            const api = await embed(
                host,
                {
                    width: 256,
                    padding: 0,
                    params: [{ name: "gapWidth", value: 5 }],
                    resolve: { scale: { y: "shared" } },
                    scales: {
                        x: { type: "index", domain: [start, start + 63] },
                        y: {
                            type: "band",
                            domain: ["a", "b"],
                            padding: 0,
                            gapPositions: ["b"],
                            gapWidth: { expr: "gapWidth" },
                        },
                    },
                    vconcat: [
                        track("first", start),
                        track("second", start),
                        track("private", 0, true),
                    ],
                },
                { renderer: "webgl" }
            );
            try {
                const root = api.debug.getViewRoot();
                const tracks = ["first", "second", "private"].map((name) =>
                    root.findDescendantByName(name)
                );
                const x = tracks[0].getScaleResolution("x");
                const y = tracks[0].getScaleResolution("y");
                await settle();
                const beforeZoom = visibleFrames;
                await x.zoomTo([start + 8, start + 55], {
                    renderImmediately: true,
                });
                const zoomDrawnImmediately = visibleFrames > beforeZoom;

                await settle();
                const beforeGapChange = visibleFrames;
                api.params.get("gapWidth").setValue(13);
                await settle();
                const gapChangeDrawn = visibleFrames > beforeGapChange;

                const points = tracks.map((track, index) => {
                    const coords = track.layoutCoords;
                    const horizontal = track.getScaleResolution("x").getScale();
                    const vertical = y.getScale();
                    return {
                        x: Math.round(
                            coords.x +
                                coords.width *
                                    horizontal(index === 2 ? 24 : start + 24)
                        ),
                        y: Math.round(
                            coords.y +
                                coords.height *
                                    (1 -
                                        vertical("a") -
                                        vertical.bandwidth() / 2)
                        ),
                    };
                });
                const picks = [];
                for (const point of points) {
                    const picked = await api.views.root().marks.pick(point);
                    picks.push(
                        picked.status === "hit"
                            ? picked.hit.datum.id
                            : picked.status
                    );
                }
                const { blob } = await api.imageExport.raster({
                    pixelRatio: 1,
                    background: null,
                });
                const bitmap = await globalThis.createImageBitmap(blob);
                const canvas = new globalThis.OffscreenCanvas(
                    bitmap.width,
                    bitmap.height
                );
                const context = canvas.getContext("2d");
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                return {
                    blocks: Array.from(blocks).sort(),
                    sharedX: tracks[1].getScaleResolution("x") === x,
                    sharedY: tracks.every(
                        (track) => track.getScaleResolution("y") === y
                    ),
                    independentX: tracks[2].getScaleResolution("x") !== x,
                    zoomDrawnImmediately,
                    gapChangeDrawn,
                    picks,
                    pixels: points.map(({ x, y }) =>
                        Array.from(context.getImageData(x, y, 1, 1).data)
                    ),
                };
            } finally {
                api.finalize();
            }
        }, coreSource);

        expect(errors).toEqual([]);
        expect(result).toEqual({
            blocks: ["SharedScale_x:8", "SharedScale_y:9"],
            sharedX: true,
            sharedY: true,
            independentX: true,
            zoomDrawnImmediately: true,
            gapChangeDrawn: true,
            picks: ["first", "second", "private"],
            pixels: Array.from({ length: 3 }, () => [255, 0, 0, 255]),
        });
    } finally {
        await browser.close();
    }
});
