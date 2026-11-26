import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { expect, test } from "playwright/test";

const coreSource = "/@fs" + fileURLToPath(new URL("../src/", import.meta.url));

const registrations = {
    webgpu: "rendering/webgpu/register.js",
    canvas: "rendering/registerCanvas.js",
    webgl: "rendering/registerWebGL.js",
};

/** @typedef {keyof typeof registrations} RasterRenderer */
/** @typedef {import("playwright/test").PlaywrightTestArgs["playwright"]} Playwright */

for (const renderer of /** @type {RasterRenderer[]} */ (
    Object.keys(registrations)
)) {
    test(`${renderer} raster maps cells and a row-backed rule onto the same locus axis`, ({
        playwright,
        baseURL,
    }) => checkRasterGrid(playwright, baseURL, renderer));
    test(`${renderer} horizontal and vertical raster strips use index edges, band placement, and cell opacity`, ({
        playwright,
        baseURL,
    }) => checkRasterStrips(playwright, baseURL, renderer));
    test(`${renderer} raster boundaries stay aligned at one-base zoom`, ({
        playwright,
        baseURL,
    }) => checkRasterCloseZoom(playwright, baseURL, renderer));
    test(`${renderer} gradient brush controls opacity per raster cell`, ({
        playwright,
        baseURL,
    }) => checkRasterBrush(playwright, baseURL, renderer));
    test(`${renderer} raster color conditions compose with opacity and picking`, ({
        playwright,
        baseURL,
    }) => checkRasterColor(playwright, baseURL, renderer));
    test(`${renderer} positional brush swaps cells between overlapping rasters`, ({
        playwright,
        baseURL,
    }) => checkRasterLens(playwright, baseURL, renderer));
    test(`${renderer} raster preserves direct RGBA colors in display and SVG export`, ({
        playwright,
        baseURL,
    }) => checkRasterImage(playwright, baseURL, renderer));
    test(`${renderer} triangle uses one locus axis and keeps tile seams aligned`, ({
        playwright,
        baseURL,
    }) => checkTriangleRaster(playwright, baseURL, renderer));
    test(`${renderer} tooltip follows cells and transparent pixels let hits through`, ({
        playwright,
        baseURL,
    }) => checkRasterTooltips(playwright, baseURL, renderer));
    if (renderer !== "webgpu") {
        test(`${renderer} recolors clipped raster tiles when the viewport log domain changes`, ({
            playwright,
            baseURL,
        }) => checkRasterLogDomain(playwright, baseURL, renderer));
    }
}

test("webgpu triangle raster supports fractional linear grid coordinates", ({
    playwright,
    baseURL,
}) => checkTriangleRaster(playwright, baseURL, "webgpu", "quantitative"));

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterLens(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const samples = await page.evaluate(
            async ({ src, renderer, register }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);
                const start = 2_000_000_001;
                const column = { origin: start, step: 1.5, count: 2 };
                const row = { origin: start, step: 4, count: 2 };
                const api = await embed(
                    globalThis.document.querySelector("#plot"),
                    {
                        assembly: "hg19",
                        width: 100,
                        height: 100,
                        padding: 0,
                        view: { stroke: null },
                        params: [
                            {
                                name: "brush",
                                select: {
                                    type: "interval",
                                    encodings: ["x", "y"],
                                    mark: { opacity: 0 },
                                },
                            },
                        ],
                        encoding: {
                            x: {
                                dimension: "column",
                                type: "locus",
                                axis: null,
                                scale: { domain: [start, start + 2] },
                            },
                            y: {
                                dimension: "row",
                                type: "locus",
                                axis: null,
                                scale: {
                                    domain: [start, start + 7],
                                    reverse: true,
                                },
                            },
                            color: { field: "color", scale: null },
                        },
                        layer: [false, true].map((upper) => ({
                            mark: {
                                type: "raster",
                                tooltip: { handler: "default" },
                            },
                            data: {
                                values: [
                                    {
                                        sample: upper ? "perturbed" : "control",
                                        dimensions: { column, row },
                                        fields: {
                                            color: Array.from(
                                                { length: 4 },
                                                () =>
                                                    upper
                                                        ? 0x8000ff00
                                                        : 0xff0000ff
                                            ),
                                        },
                                    },
                                ],
                            },
                            encoding: {
                                opacity: {
                                    condition: upper
                                        ? [
                                              {
                                                  test: {
                                                      and: [
                                                          {
                                                              param: "brush",
                                                              empty: false,
                                                          },
                                                          {
                                                              param: {
                                                                  or: ["brush"],
                                                              },
                                                              empty: false,
                                                          },
                                                      ],
                                                  },
                                                  value: 1,
                                              },
                                              {
                                                  param: "brush",
                                                  empty: false,
                                                  value: 0.5,
                                              },
                                          ]
                                        : {
                                              param: "brush",
                                              empty: false,
                                              value: 0,
                                          },
                                    value: upper ? 0 : 1,
                                },
                            },
                        })),
                    },
                    {
                        renderer,
                        onError: (error) => {
                            throw error;
                        },
                    }
                );
                try {
                    const runtime = api.debug
                        .getViewRoot()
                        .getDescendants()
                        .find((view) => view.mark?.getType() === "raster")
                        .paramRuntime.findRuntimeForParam("brush");
                    const read = () =>
                        globalThis.readRasterPixels(
                            api,
                            [
                                [34, 34],
                                [75, 25],
                                [25, 75],
                                [75, 75],
                            ],
                            null
                        );
                    const before = await read();
                    const pick = async () => {
                        const marks = api.views.root().marks;
                        const point = { x: 34, y: 34 };
                        let result = await marks.pick(point);
                        // A pending redraw can invalidate the GPU readback.
                        if (result.status === "invalidated")
                            result = await marks.pick(point);
                        return result.status === "hit"
                            ? result.hit.datum.sample
                            : result.status;
                    };
                    const beforePick = await pick();
                    runtime.setValue("brush", {
                        type: "interval",
                        intervals: { x: [start + 1, start + 2], y: null },
                    });
                    const partial = await read();
                    // Intersect a fractional x edge and lie wholly inside the first y bin.
                    runtime.setValue("brush", {
                        type: "interval",
                        intervals: {
                            x: [start + 1, start + 2],
                            y: [start + 1, start + 2],
                        },
                    });
                    const active = await read();
                    const activePick = await pick();
                    runtime.setValue("brush", {
                        type: "interval",
                        intervals: { x: null, y: null },
                    });
                    return {
                        before,
                        partial,
                        active,
                        cleared: await read(),
                        beforePick,
                        activePick,
                    };
                } finally {
                    api.finalize();
                }
            },
            setup
        );
        const red = [255, 0, 0, 255];
        const green = [0, 255, 0, 128];
        expect(samples.before).toEqual([red, red, red, red]);
        expect(samples.partial).toEqual(samples.before);
        expect(samples.active).toEqual([green, green, red, red]);
        expect(samples.cleared).toEqual(samples.before);
        expect([samples.beforePick, samples.activePick]).toEqual([
            "control",
            "perturbed",
        ]);
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterTooltips(playwright, baseURL, renderer) {
    await withRasterPage(
        playwright,
        baseURL,
        renderer,
        async (page, setup) => {
            await page.evaluate(async ({ src, renderer, register }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);
                const start = 2_000_000_001;
                const dimension = { origin: start, step: 1, count: 4 };
                globalThis.rasterTooltip = null;
                const api = await embed(
                    globalThis.document.querySelector("#plot"),
                    {
                        assembly: "hg19",
                        width: 100,
                        height: 100,
                        padding: 0,
                        view: { stroke: null },
                        layer: [
                            {
                                data: {
                                    values: [
                                        {
                                            dimensions: {
                                                column: dimension,
                                                row: dimension,
                                            },
                                            fields: {
                                                contact: Array.from(
                                                    { length: 16 },
                                                    (_, index) => 1 + index
                                                ),
                                            },
                                        },
                                    ],
                                },
                                projection: {
                                    type: "triangle",
                                    direction: "down",
                                },
                                mark: "raster",
                                encoding: {
                                    x: {
                                        dimension: "column",
                                        type: "locus",
                                        axis: null,
                                        scale: { domain: [start, start + 9] },
                                    },
                                    y: { dimension: "row", type: "locus" },
                                    color: {
                                        field: "contact",
                                        type: "quantitative",
                                        legend: null,
                                    },
                                },
                            },
                            {
                                data: {
                                    values: [
                                        {
                                            sample: "overlay",
                                            dimensions: {
                                                column: {
                                                    origin: start,
                                                    step: 1,
                                                    count: 3,
                                                },
                                                row: {
                                                    origin: 87.5,
                                                    step: 5,
                                                    count: 1,
                                                },
                                            },
                                            fields: {
                                                pixel: [
                                                    0xff0000ff, 0xff00ff00, 0,
                                                ],
                                                quality: [10, 20, 30],
                                            },
                                        },
                                    ],
                                },
                                mark: {
                                    type: "raster",
                                    tooltip: { handler: "default" },
                                },
                                encoding: {
                                    x: {
                                        dimension: "column",
                                        type: "locus",
                                        axis: null,
                                        scale: { domain: [start, start + 9] },
                                    },
                                    y: {
                                        dimension: "row",
                                        type: "quantitative",
                                        axis: null,
                                        scale: { domain: [0, 100] },
                                    },
                                    color: { field: "pixel", scale: null },
                                },
                            },
                        ],
                    },
                    {
                        renderer,
                        onError: (error) => {
                            throw error;
                        },
                        tooltipHandlers: {
                            default: async (
                                datum,
                                _mark,
                                _params,
                                { rasterCell, genomicRows }
                            ) => {
                                globalThis.rasterTooltip = {
                                    datum,
                                    rasterCell,
                                    genomicRows,
                                };
                                return "Cell";
                            },
                        },
                    }
                );
                globalThis.rasterTooltipApi = api;
            }, setup);
            const hovered = () => page.evaluate(() => globalThis.rasterTooltip);
            const canvas = page.locator("#plot canvas");
            await expect
                .poll(() =>
                    page.evaluate(async () => {
                        const result = await globalThis.rasterTooltipApi.views
                            .root()
                            .marks.pick({ x: 5, y: 10 });
                        return result.status === "hit" && result.hit.datum;
                    })
                )
                .toMatchObject({
                    sample: "overlay",
                    dimensions: { column: { count: 3 } },
                });
            await canvas.hover({ position: { x: 5, y: 10 } });
            await expect.poll(hovered).toEqual({
                datum: { sample: "overlay", pixel: 0xff0000ff, quality: 10 },
                rasterCell: { column: 0, row: 0 },
                genomicRows: [
                    { key: "Column", value: expect.stringMatching(/^chr/) },
                ],
            });
            await canvas.hover({ position: { x: 15, y: 10 } });
            await expect.poll(hovered).toEqual({
                datum: { sample: "overlay", pixel: 0xff00ff00, quality: 20 },
                rasterCell: { column: 1, row: 0 },
                genomicRows: [
                    { key: "Column", value: expect.stringMatching(/^chr/) },
                ],
            });
            await canvas.hover({ position: { x: 25, y: 10 } });
            await expect.poll(hovered).toMatchObject({
                datum: { contact: 14 },
                rasterCell: { column: 1, row: 3 },
                genomicRows: [
                    { key: "Column", value: expect.stringMatching(/^chr/) },
                    { key: "Row", value: expect.stringMatching(/^chr/) },
                ],
            });
        },
        2
    );
}

/**
 * @param {Playwright} playwright
 * @param {string} baseURL
 * @param {RasterRenderer} renderer
 * @param {"locus" | "quantitative"} [type]
 */
async function checkTriangleRaster(
    playwright,
    baseURL,
    renderer,
    type = "locus"
) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const results = await page.evaluate(
            async ({ src, renderer, register, type }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);
                await import(src + "rendering/registerSvg.js");
                // Both domains span 16 units, but linear endpoints are fractional.
                const start = type === "locus" ? 2_000_000_001 : 0.25;
                const tile = (column, row, color) => ({
                    dimensions: {
                        column: { origin: start + column, step: 1, count: 2 },
                        matrixRow: { origin: start + row, step: 1, count: 2 },
                    },
                    fields: { color: [color, color, color, color] },
                });
                const samples = [];
                for (const [reverse, down] of [
                    [false, false],
                    [true, false],
                    [false, true],
                    [true, true],
                ]) {
                    const api = await embed(
                        globalThis.document.querySelector("#plot"),
                        {
                            assembly: "hg19",
                            width: 160,
                            height: 60,
                            padding: 0,
                            view: { stroke: null },
                            projection: down
                                ? { type: "triangle", direction: "down" }
                                : "triangle",
                            scales: {
                                x: {
                                    type: type === "locus" ? "locus" : "linear",
                                    domain: [
                                        start,
                                        start + (type === "locus" ? 15 : 16),
                                    ],
                                    reverse,
                                },
                            },
                            layer: [
                                {
                                    data: {
                                        values: [
                                            tile(0, 0, 0xff00ff00),
                                            tile(0, 2, 0xff0000ff),
                                            tile(0, 4, 0xffff0000),
                                            tile(-2, 2, 0xff00ffff),
                                        ],
                                    },
                                    mark: "raster",
                                    encoding: {
                                        x: {
                                            dimension: "column",
                                            type,
                                            axis: null,
                                        },
                                        y: { dimension: "matrixRow", type },
                                        color: { field: "color", scale: null },
                                    },
                                },
                                {
                                    // The center of the tile at column 1 and row 5.
                                    data: {
                                        values: [
                                            {
                                                column: start + 1,
                                                row: start + 5,
                                            },
                                        ],
                                    },
                                    mark: {
                                        type: "point",
                                        size: 25,
                                        color: "black",
                                    },
                                    encoding: {
                                        x: {
                                            field: "column",
                                            type,
                                            axis: null,
                                        },
                                        y: { field: "row", type },
                                    },
                                },
                                {
                                    // Both anchors lie on the diagonal.
                                    data: {
                                        values: [
                                            {
                                                a: start + (reverse ? 12 : 8),
                                                b: start + (reverse ? 8 : 12),
                                            },
                                        ],
                                    },
                                    mark: {
                                        type: "link",
                                        color: "black",
                                        size: 4,
                                    },
                                    encoding: {
                                        x: { field: "a", type, axis: null },
                                        y: { field: "a", type },
                                        x2: { field: "b" },
                                        y2: { field: "b" },
                                    },
                                },
                            ],
                        },
                        {
                            renderer,
                            onError: (error) => {
                                throw error;
                            },
                        }
                    );
                    try {
                        const view = api.debug
                            .getViewRoot()
                            .getDescendants()
                            .find((view) => view.mark?.getType() === "raster");
                        // Opposite sides of the row tile seam, a diagonal cell,
                        // and a contact with a column endpoint left of the domain.
                        const points = [
                            [21.25, 43.75],
                            [23.75, 41.25],
                            [5, 57.5],
                            [10, 45],
                            [22.5, 42.5],
                            [30, 40],
                            [100, 40],
                        ].map(([x, y]) => [
                            Math.floor(reverse ? 160 - x : x),
                            Math.floor(down ? 60 - y : y),
                        ]);
                        const raster = await globalThis.readRasterPixels(
                            api,
                            points,
                            null
                        );
                        const { pixels: svg, document } =
                            await globalThis.readSvgRasterPixels(
                                api,
                                points.slice(0, -2)
                            );
                        const point = document.querySelector("circle");
                        samples.push({
                            raster: raster.slice(0, -2),
                            svg,
                            pointPixel: raster.at(-2),
                            arcPixel: raster.at(-1),
                            pointPosition: [
                                Number(point.getAttribute("cx")),
                                Number(point.getAttribute("cy")),
                            ],
                            reverse,
                            down,
                            zoomableY: view
                                .getScaleResolution("y")
                                .isZoomable(),
                        });
                    } finally {
                        api.finalize();
                    }
                }
                return samples;
            },
            { ...setup, type }
        );
        const expected = [
            [255, 0, 0, 255],
            [0, 0, 255, 255],
            [0, 255, 0, 255],
            [255, 255, 0, 255],
        ];
        for (const {
            raster,
            svg,
            pointPixel,
            arcPixel,
            pointPosition,
            reverse,
            down,
            zoomableY,
        } of results) {
            expect(zoomableY).toBe(false);
            expect(pointPixel).toEqual([0, 0, 0, 255]);
            expect(arcPixel).toEqual([0, 0, 0, 255]);
            expect(pointPosition).toEqual([reverse ? 130 : 30, down ? 20 : 40]);
            for (const pixels of [raster, svg]) {
                expect(pixels.slice(0, -1)).toEqual(expected);
                if (renderer !== "canvas") {
                    // MSAA can resolve a mix of the two opaque neighbors.
                    const [r, g, b, a] = pixels.at(-1);
                    expect([g, a]).toEqual([0, 255]);
                    expect(Math.abs(r + b - 255)).toBeLessThanOrEqual(1);
                }
            }
        }
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterImage(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const result = await page.evaluate(
            async ({ src, renderer, register }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);
                await import(src + "rendering/registerSvg.js");
                const pixels = [0xff0000ff, 0x8000ff00, 0xffff0000, 0x0000ffff];
                const api = await embed(
                    globalThis.document.querySelector("#plot"),
                    {
                        width: 160,
                        height: 80,
                        padding: 0,
                        view: { stroke: null },
                        data: {
                            values: [pixels, Uint32Array.from(pixels)].map(
                                (values, i) => ({
                                    dimensions: {
                                        column: {
                                            origin: 2 * i,
                                            step: 1,
                                            count: 2,
                                        },
                                        row: { origin: 0, step: 1, count: 2 },
                                    },
                                    fields: { pixels: values },
                                })
                            ),
                        },
                        mark: { type: "raster", opacity: 0.5 },
                        encoding: {
                            x: {
                                dimension: "column",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                dimension: "row",
                                type: "quantitative",
                                axis: null,
                                scale: { reverse: true },
                            },
                            color: { field: "pixels", scale: null },
                        },
                    },
                    {
                        renderer,
                        onError: (error) => {
                            throw error;
                        },
                    }
                );
                const points = [0, 80].flatMap((offset) => [
                    [20 + offset, 20],
                    [60 + offset, 20],
                    [20 + offset, 60],
                    [60 + offset, 60],
                ]);
                try {
                    const raster = await globalThis.readRasterPixels(
                        api,
                        points,
                        null
                    );
                    const { pixels: svg } =
                        await globalThis.readSvgRasterPixels(api, points);
                    const { status } = await api.views
                        .root()
                        .marks.pick({ x: 20, y: 20 });
                    return { status, raster, svg };
                } finally {
                    api.finalize();
                }
            },
            setup
        );
        const { status, ...images } = result;
        expect(status).toBe("empty");
        const tile = [
            [255, 0, 0, 128],
            [0, 255, 0, 64],
            [0, 0, 255, 128],
            [0, 0, 0, 0],
        ];
        const expected = [...tile, ...tile];
        for (const [format, samples] of Object.entries(images)) {
            expect(
                samples.map((pixel) => pixel.slice(0, 3)),
                format
            ).toEqual(expected.map((pixel) => pixel.slice(0, 3)));
            for (const [i, pixel] of samples.entries()) {
                expect(Math.abs(pixel[3] - expected[i][3])).toBeLessThanOrEqual(
                    1
                );
            }
        }
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterLogDomain(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const result = await page.evaluate(
            async ({ src, renderer, register }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);
                const api = await embed(
                    globalThis.document.querySelector("#plot"),
                    {
                        width: 100,
                        height: 100,
                        padding: 0,
                        config: { background: null },
                        view: { stroke: null },
                        data: {
                            values: [
                                {
                                    dimensions: {
                                        column: {
                                            origin: 0,
                                            step: 1,
                                            count: 5,
                                        },
                                        row: { origin: 0, step: 1, count: 1 },
                                    },
                                    fields: { value: [0, 1, 10, 100, null] },
                                },
                            ],
                        },
                        mark: { type: "raster", clip: true },
                        encoding: {
                            x: {
                                dimension: "column",
                                type: "quantitative",
                                axis: null,
                                scale: { domain: [0, 5], zoom: true },
                            },
                            y: {
                                dimension: "row",
                                type: "quantitative",
                                axis: null,
                            },
                            color: {
                                field: "value",
                                type: "quantitative",
                                legend: null,
                                scale: {
                                    type: "log",
                                    domain: { source: "viewport" },
                                    range: ["black", "red"],
                                    clamp: true,
                                },
                            },
                        },
                    },
                    { renderer }
                );
                const view = api.debug
                    .getViewRoot()
                    .getDescendants()
                    .find(
                        (candidate) => candidate.mark?.getType() === "raster"
                    );
                const x = view.getScaleResolution("x");
                const color = view.getScaleResolution("color");

                async function sample() {
                    return {
                        domain: color.getDomain().map(Math.round),
                        pixels: await globalThis.readRasterPixels(
                            api,
                            [
                                [10, 50],
                                [50, 50],
                                [90, 50],
                            ],
                            null
                        ),
                    };
                }
                try {
                    const before = await sample();
                    const domainUpdated = new Promise((resolve) => {
                        const onDomain = () => {
                            if (
                                Math.abs(color.getDomain().at(-1) - 10) < 1e-6
                            ) {
                                color.removeEventListener("domain", onDomain);
                                resolve(undefined);
                            }
                        };
                        color.addEventListener("domain", onDomain);
                    });
                    await x.zoomTo([0.5, 2.9]);
                    await domainUpdated;
                    return { before, after: await sample() };
                } finally {
                    api.finalize();
                }
            },
            setup
        );
        const black = [0, 0, 0, 255];
        expect(result).toEqual({
            before: {
                domain: [1, 100],
                pixels: [black, [128, 0, 0, 255], [0, 0, 0, 0]],
            },
            after: {
                domain: [1, 10],
                pixels: [black, black, [255, 0, 0, 255]],
            },
        });
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterBrush(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const result = await page.evaluate(
            async ({ src, renderer, register }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);
                const api = await embed(
                    globalThis.document.querySelector("#plot"),
                    {
                        width: 150,
                        height: 100,
                        padding: 0,
                        config: { background: null },
                        view: { stroke: null },
                        params: [
                            { name: "upper", value: 1 },
                            {
                                name: "brush",
                                select: {
                                    type: "interval",
                                    encodings: ["color"],
                                },
                                bind: "legend",
                            },
                        ],
                        data: {
                            values: [
                                {
                                    dimensions: {
                                        column: {
                                            origin: 0,
                                            step: 1,
                                            count: 5,
                                        },
                                        row: { origin: 0, step: 1, count: 1 },
                                    },
                                    fields: { value: [1, 2, 4, 8, 16] },
                                },
                            ],
                        },
                        mark: "raster",
                        encoding: {
                            x: {
                                dimension: "column",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                dimension: "row",
                                type: "quantitative",
                                axis: null,
                            },
                            color: {
                                field: "value",
                                type: "quantitative",
                                scale: {
                                    type: "log",
                                    domain: [1, { expr: "upper" }],
                                    scheme: "higlassfall",
                                    clamp: true,
                                },
                                legend: {
                                    orient: "bottom",
                                    direction: "horizontal",
                                },
                            },
                            opacity: {
                                condition: { param: "brush", value: 1 },
                                value: 0,
                            },
                        },
                    },
                    {
                        renderer,
                        onError: (error) => {
                            throw new Error(error.message);
                        },
                    }
                );
                const views = api.debug.getViewRoot().getDescendants();
                const raster = views.find(
                    (view) => view.mark?.getType() === "raster"
                );
                const ramp = views.find((view) => view.name === "gradientRamp");
                const scale = raster.getScaleResolution("color");
                const initializedDomain = scale.getDomain();
                api.params.get("upper").setValue(16);
                const alpha = async () => {
                    const { x, y, width, height } = raster.layoutCoords;
                    const points = Array.from({ length: 5 }, (_, i) => [
                        Math.floor(x + (width * (i + 0.5)) / 5),
                        Math.floor(y + height / 2),
                    ]);
                    const pixels = await globalThis.readRasterPixels(
                        api,
                        points,
                        null
                    );
                    return pixels.map((pixel) => pixel[3]);
                };
                const setBounds = (bounds) =>
                    raster.paramRuntime.setValue("brush", {
                        type: "interval",
                        intervals: { color: bounds },
                    });
                const baseline = await alpha();
                setBounds([2, 8]);
                const selected = await alpha();
                setBounds([2, 8 + 1e-8]);
                const upperBetweenFloats = await alpha();
                setBounds([8 + 1e-8, Infinity]);
                const lowerBetweenFloats = await alpha();
                setBounds([8, 8]);
                const zeroWidth = await alpha();
                setBounds([8, Infinity]);
                const unbounded = await alpha();
                setBounds(null);
                const reset = await alpha();

                const rows = Array.from(ramp.getCollector().getData());
                const enc = ramp.mark.encoders;
                const edges = [rows[0], rows.at(-1)].flatMap((row) => [
                    ramp.coords.denormalizePoint(enc.x(row), enc.y(row), true),
                    ramp.coords.denormalizePoint(
                        enc.x2(row),
                        enc.y2(row),
                        true
                    ),
                ]);
                const xs = edges.map(({ x }) => x);
                const ys = edges.map(({ y }) => y);
                const rect = globalThis.document
                    .querySelector("#plot canvas")
                    .getBoundingClientRect();
                globalThis.rasterBrushTest = { api, raster, alpha };
                return {
                    initializedDomain,
                    baseline,
                    selected,
                    upperBetweenFloats,
                    lowerBetweenFloats,
                    zeroWidth,
                    unbounded,
                    reset,
                    ramp: {
                        left: rect.x + Math.min(...xs),
                        right: rect.x + Math.max(...xs),
                        y: rect.y + (Math.min(...ys) + Math.max(...ys)) / 2,
                    },
                };
            },
            setup
        );
        const { left, right, y } = result.ramp;
        await page.mouse.move(left + (right - left) * 0.15, y);
        await page.mouse.down();
        await page.mouse.move(left + (right - left) * 0.85, y, { steps: 5 });
        await page.mouse.up();
        const brushed = await page.evaluate(() =>
            globalThis.rasterBrushTest.alpha()
        );
        await page.mouse.dblclick(left + (right - left) / 2, y);
        // WebGPU dispatches the double-click after asynchronous picking.
        await page.waitForFunction(
            () =>
                globalThis.rasterBrushTest.raster.paramRuntime.findValue(
                    "brush"
                ).intervals.color === null
        );
        const cleared = await page.evaluate(async () => {
            const { alpha, api, raster } = globalThis.rasterBrushTest;
            const result = {
                brush: raster.paramRuntime.findValue("brush").intervals.color,
                alpha: await alpha(),
                domain: raster.getScaleResolution("color").getDomain(),
            };
            api.finalize();
            return result;
        });
        expect(result.initializedDomain).toEqual([1, 1]);
        expect(result.baseline).toEqual([255, 255, 255, 255, 255]);
        expect(result.selected).toEqual([0, 255, 255, 0, 0]);
        if (renderer !== "canvas") {
            // Both thresholds round to 8 when uploaded as Float32.
            expect(result.upperBetweenFloats).toEqual(result.selected);
            expect(result.lowerBetweenFloats).toEqual(result.unbounded);
        } else {
            expect(result.upperBetweenFloats).toEqual([0, 255, 255, 255, 0]);
            expect(result.lowerBetweenFloats).toEqual([0, 0, 0, 0, 255]);
        }
        expect(result.zeroWidth).toEqual([0, 0, 0, 0, 0]);
        expect(result.unbounded).toEqual([0, 0, 0, 255, 255]);
        expect(result.reset).toEqual(result.baseline);
        expect(brushed).toEqual([0, 255, 255, 255, 0]);
        expect(cleared).toEqual({
            brush: null,
            alpha: result.baseline,
            domain: [1, 16],
        });
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterColor(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const result = await page.evaluate(
            async ({ src, renderer, register }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);
                await import(src + "rendering/registerSvg.js");
                const api = await embed(
                    globalThis.document.querySelector("#plot"),
                    {
                        width: 90,
                        height: 30,
                        padding: 0,
                        config: { background: null },
                        view: { stroke: null },
                        params: [
                            {
                                name: "highlight",
                                select: {
                                    type: "interval",
                                    encodings: ["color"],
                                },
                                bind: "legend",
                            },
                            {
                                name: "hide",
                                select: { type: "interval", encodings: ["x"] },
                            },
                        ],
                        data: {
                            values: [
                                {
                                    dimensions: {
                                        column: {
                                            origin: 0,
                                            step: 1,
                                            count: 3,
                                        },
                                        row: { origin: 0, step: 1, count: 1 },
                                    },
                                    fields: { signal: [0, 1, 2] },
                                },
                            ],
                        },
                        mark: "raster",
                        encoding: {
                            x: {
                                dimension: "column",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                dimension: "row",
                                type: "quantitative",
                                axis: null,
                            },
                            color: {
                                field: "signal",
                                type: "quantitative",
                                scale: { range: ["blue", "blue"] },
                                condition: [
                                    {
                                        param: "hide",
                                        empty: false,
                                        value: null,
                                    },
                                    {
                                        param: "highlight",
                                        empty: false,
                                        value: "red",
                                    },
                                ],
                            },
                            opacity: {
                                condition: {
                                    param: "highlight",
                                    empty: false,
                                    value: 0.4,
                                },
                                value: 1,
                            },
                        },
                    },
                    { renderer }
                );
                try {
                    const raster = api.debug
                        .getViewRoot()
                        .getDescendants()
                        .find((view) => view.mark?.getType() === "raster");
                    const { x, y, width, height } = raster.layoutCoords;
                    const points = [1 / 6, 1 / 2, 5 / 6].map((fraction) => [
                        Math.floor(x + width * fraction),
                        Math.floor(y + height / 2),
                    ]);
                    const sample = () =>
                        globalThis.readRasterPixels(api, points, null);
                    const before = await sample();
                    raster.paramRuntime.setValue("highlight", {
                        type: "interval",
                        intervals: { color: [1, 3] },
                    });
                    // The brush overlaps the last cell and leaves its sampled
                    // center clear of the brush overlay.
                    raster.paramRuntime.setValue("hide", {
                        type: "interval",
                        intervals: { x: [2.1, 2.2] },
                    });
                    const after = await sample();
                    const svg = await globalThis.readSvgRasterPixels(
                        api,
                        points
                    );
                    const marks = api.views.root().marks;
                    const picked = [];
                    for (const [x, y] of points.slice(1)) {
                        picked.push((await marks.pick({ x, y })).status);
                    }
                    return {
                        before,
                        after,
                        svg: svg.pixels,
                        domain: raster.getScaleResolution("color").getDomain(),
                        picked,
                    };
                } finally {
                    api.finalize();
                }
            },
            setup
        );
        const blue = [0, 0, 255, 255];
        const brushed = [blue, [255, 0, 0, 102], [0, 0, 0, 0]];
        expect(result).toEqual({
            before: [blue, blue, blue],
            after: brushed,
            svg: brushed,
            domain: [0, 2],
            picked: ["hit", "empty"],
        });
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterGrid(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const result = await page.evaluate(async (args) => {
            const { src, renderer, register } = args;
            const { embed } = await import(src + "minimal.js");
            await import(src + register);
            await import(src + "rendering/registerSvg.js");
            const start = 2_000_000_001;
            const errors = [];
            const api = await embed(
                globalThis.document.querySelector("#plot"),
                {
                    assembly: "hg19",
                    width: 100,
                    height: 100,
                    padding: 0,
                    view: { stroke: null },
                    params: [
                        { name: "upper", value: 4 },
                        { name: "upperColor", value: "red" },
                    ],
                    resolve: { scale: { x: "shared", y: "shared" } },
                    scales: {
                        x: { type: "locus", domain: [start, start + 1] },
                        y: {
                            type: "linear",
                            domain: [0, 2],
                            reverse: true,
                        },
                    },
                    layer: [
                        {
                            data: {
                                values: [
                                    {
                                        dimensions: {
                                            column: {
                                                origin: start,
                                                step: 1,
                                                count: 2,
                                            },
                                            row: {
                                                origin: 0,
                                                step: 1,
                                                count: 2,
                                            },
                                        },
                                        fields: { value: [0, 2, 4, 1] },
                                    },
                                ],
                            },
                            mark: { type: "raster", clip: true },
                            encoding: {
                                x: {
                                    dimension: "column",
                                    type: "locus",
                                    axis: null,
                                },
                                y: {
                                    dimension: "row",
                                    type: "quantitative",
                                    axis: null,
                                },
                                color: {
                                    field: "value",
                                    type: "quantitative",
                                    scale: {
                                        domain: [0, { expr: "upper" }],
                                        range: [
                                            "black",
                                            { expr: "upperColor" },
                                        ],
                                    },
                                    legend: null,
                                },
                            },
                        },
                        {
                            data: { values: [{ pos: start + 1 }] },
                            mark: { type: "rule", color: "blue", size: 4 },
                            encoding: {
                                x: {
                                    field: "pos",
                                    type: "locus",
                                    band: 0,
                                    axis: null,
                                },
                            },
                        },
                    ],
                },
                {
                    renderer,
                    onError: (error) => errors.push(error.message),
                }
            );

            async function sample() {
                const pixels = await globalThis.readRasterPixels(api, [
                    [25, 25],
                    [75, 25],
                    [25, 75],
                    [75, 75],
                    [50, 25],
                ]);
                return pixels.map((pixel) => pixel.slice(0, 3));
            }

            try {
                await api.awaitVisibleLazyData(
                    globalThis.AbortSignal.timeout(10000)
                );
                const before = await sample();

                // Fractional output sizes exercise framebuffer rounding and SVG's zero pixel offset.
                const { blob, rasterized } = await api.imageExport.svg({
                    logicalWidth: 81,
                    logicalHeight: 33,
                    background: null,
                    rasterization: { pixelRatio: 1.25 },
                });
                const svg = new globalThis.DOMParser().parseFromString(
                    await blob.text(),
                    "image/svg+xml"
                );
                const paintOrder = Array.from(
                    svg.querySelectorAll(
                        "[data-rasterized], [data-mark-type=rule]"
                    ),
                    (node) =>
                        node.hasAttribute("data-rasterized") ? "image" : "rule"
                );
                const image = svg.querySelector("[data-rasterized] image");
                const bitmap = await globalThis.createImageBitmap(
                    await (
                        await globalThis.fetch(image.getAttribute("href"))
                    ).blob()
                );
                const size = [bitmap.width, bitmap.height];
                const context = new globalThis.OffscreenCanvas(
                    bitmap.width,
                    bitmap.height
                ).getContext("2d");
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                const topRow = [20, 80].map((x) =>
                    Array.from(context.getImageData(x, 0, 1, 1).data)
                );

                api.params.get("upper").setValue(8);
                api.params.get("upperColor").setValue("blue");
                return {
                    before,
                    after: await sample(),
                    errors,
                    rasterized,
                    paintOrder,
                    size,
                    topRow,
                };
            } finally {
                api.finalize();
            }
        }, setup);
        expect(result.errors).toEqual([]);
        expect(result.before).toEqual([
            [0, 0, 0],
            [128, 0, 0],
            [255, 0, 0],
            [64, 0, 0],
            [0, 0, 255],
        ]);
        expect(result.after[2]).toEqual([0, 0, 128]);
        expect(result.paintOrder).toEqual(["image", "rule"]);
        expect(result.size).toEqual([102, 42]);
        expect(result.topRow).toEqual([
            [0, 0, 0, 255],
            [128, 0, 0, 255],
        ]);
        expect(result.rasterized).toEqual([
            {
                targets: [{ markType: "raster", instanceCount: 1 }],
                reason: "raster-mark",
                pixelRatio: 1.25,
            },
        ]);
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterCloseZoom(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const result = await page.evaluate(
            async ({ src, register, renderer }) => {
                const { embed } = await import(src + "minimal.js");
                await import(src + register);

                // A million-base tile remains at the finest available resolution.
                // The two tiles also share an edge that cannot fit in one u32.
                const edge = 2 ** 32;
                const count = 256;
                const step = 4000;
                const origin = edge - count * step;
                const middle = origin + (count / 2) * step;
                const tiles = [origin, edge].map((origin, tile) => ({
                    dimensions: {
                        column: { origin, step, count },
                        row: { origin: 0, step: 1, count: 1 },
                    },
                    fields: {
                        value: Array.from({ length: count }, (_, column) =>
                            tile || column < count / 2 ? "red" : "blue"
                        ),
                    },
                }));

                const results = [];
                for (const reverse of [false, true]) {
                    const api = await embed(
                        globalThis.document.querySelector("#plot"),
                        {
                            assembly: "large",
                            genomes: {
                                large: {
                                    contigs: [{ name: "chr", size: edge * 2 }],
                                },
                            },
                            width: 512,
                            height: 32,
                            padding: 0,
                            config: { background: null },
                            view: { stroke: null },
                            scales: {
                                x: {
                                    type: "locus",
                                    domain: [middle - 0.125, middle - 0.125],
                                    zoom: true,
                                    reverse,
                                },
                            },
                            layer: [
                                {
                                    data: { values: tiles },
                                    mark: "raster",
                                    encoding: {
                                        x: {
                                            dimension: "column",
                                            type: "locus",
                                            axis: null,
                                        },
                                        y: {
                                            dimension: "row",
                                            type: "quantitative",
                                            axis: null,
                                        },
                                        color: {
                                            field: "value",
                                            type: "nominal",
                                            legend: null,
                                            scale: {
                                                domain: ["red", "blue"],
                                                range: ["red", "blue"],
                                            },
                                        },
                                    },
                                },
                                {
                                    data: { values: [{ position: middle }] },
                                    mark: {
                                        type: "rule",
                                        color: "lime",
                                        size: 2,
                                    },
                                    encoding: {
                                        x: {
                                            field: "position",
                                            type: "locus",
                                            axis: null,
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            renderer,
                            onError: (error) => {
                                throw new Error(error.message);
                            },
                        }
                    );
                    try {
                        await api.awaitVisibleLazyData(
                            globalThis.AbortSignal.timeout(10000)
                        );
                        const x = api.debug
                            .getViewRoot()
                            .getDescendants()
                            .find((view) => view.mark?.getType() === "raster")
                            .getScaleResolution("x");
                        for (const boundary of [middle, edge]) {
                            for (const offset of [0.125, 0.375]) {
                                await x.zoomTo([
                                    boundary - offset,
                                    boundary - offset,
                                ]);
                                const pixel = (fraction) =>
                                    Math.round(
                                        (reverse ? 1 - fraction : fraction) *
                                            512
                                    );
                                const at = pixel(offset);
                                // Sample either side of the edge, allowing for subpixel rounding.
                                const side = reverse ? -1 : 1;
                                const points = [
                                    [at - 2 * side, 12],
                                    [at + 2 * side, 12],
                                ];
                                if (boundary === middle)
                                    points.push([pixel(offset + 0.5), 12]);
                                results.push(
                                    await globalThis.readRasterPixels(
                                        api,
                                        points,
                                        null
                                    )
                                );
                            }
                        }
                    } finally {
                        api.finalize();
                    }
                }
                return results;
            },
            setup
        );
        const red = [255, 0, 0, 255];
        const blue = [0, 0, 255, 255];
        const green = [0, 255, 0, 255];
        expect(result).toEqual([
            [red, blue, green],
            [red, blue, green],
            [blue, red],
            [blue, red],
            [red, blue, green],
            [red, blue, green],
            [blue, red],
            [blue, red],
        ]);
    });
}

/** @param {Playwright} playwright @param {string} baseURL @param {RasterRenderer} renderer */
async function checkRasterStrips(playwright, baseURL, renderer) {
    await withRasterPage(playwright, baseURL, renderer, async (page, setup) => {
        const results = await page.evaluate(async (args) => {
            const { src, renderer, register } = args;
            const { embed } = await import(src + "minimal.js");
            await import(src + register);

            async function render(reverse, vertical) {
                const gridAxis = vertical ? "y" : "x";
                const bandAxis = vertical ? "x" : "y";
                const dimension = vertical ? "row" : "column";
                const host = globalThis.document.createElement("div");
                globalThis.document.body.append(host);
                const api = await embed(
                    host,
                    {
                        width: vertical ? 60 : 80,
                        height: vertical ? 80 : 60,
                        padding: 0,
                        config: { background: null },
                        view: { stroke: null },
                        params: [
                            {
                                name: "highlight",
                                select: {
                                    type: "point",
                                    encodings: [bandAxis],
                                },
                                value: [{ [bandAxis]: "a" }],
                            },
                            {
                                name: "bases",
                                select: {
                                    type: "point",
                                    encodings: ["color"],
                                    toggle: true,
                                },
                            },
                        ],
                        data: {
                            values: ["AG?-", "-🙂A"].map((sequence, row) => ({
                                id: row ? "b" : "a",
                                dimensions: {
                                    [dimension]: {
                                        origin: 9,
                                        step: 2,
                                        count: 4,
                                    },
                                },
                                fields: { base: sequence },
                            })),
                        },
                        mark: "raster",
                        encoding: {
                            [gridAxis]: {
                                dimension,
                                type: "index",
                                axis: null,
                                scale: {
                                    reverse,
                                    zoom: { extent: "data" },
                                },
                            },
                            [bandAxis]: {
                                field: "id",
                                type: "nominal",
                                axis: null,
                                scale: {
                                    type: "band",
                                    domain: ["a", "b"],
                                    paddingInner: 0.4,
                                },
                            },
                            color: {
                                field: "base",
                                type: "nominal",
                                legend: null,
                                scale: {
                                    type: "ordinal",
                                    domain: ["A", "G", "-"],
                                    range: ["red", "blue", "gray"],
                                },
                            },
                            opacity: {
                                condition: {
                                    test: {
                                        and: [
                                            { param: "highlight" },
                                            { param: "bases" },
                                        ],
                                    },
                                    value: 1,
                                },
                                value: 0.5,
                            },
                        },
                    },
                    {
                        renderer,
                        onError: (error) => {
                            throw error;
                        },
                    }
                );
                try {
                    const view = api.debug
                        .getViewRoot()
                        .getDescendants()
                        .find(
                            (candidate) =>
                                candidate.mark?.getType() === "raster"
                        );
                    const scale = view.getScaleResolution(gridAxis);
                    // Leave room for pixel offsets when transposing the samples.
                    const [first, second, third, last] = vertical
                        ? [4, 24, 44, 75]
                        : [1, 21, 41, 79];
                    const sampleEdge =
                        renderer === "webgl" && !reverse && !vertical;
                    // Vertical index scales start at the bottom by default.
                    const read = (points) =>
                        globalThis.readRasterPixels(
                            api,
                            vertical
                                ? points.map(([x, y]) => [y, 79 - x])
                                : points,
                            null
                        );
                    const pixels = await read([
                        [first, 12],
                        [second, 12],
                        [third, 12],
                        [last, 12],
                        [10, 30],
                        [first, 48],
                        [last, 48],
                        ...(sampleEdge
                            ? [
                                  [20, 12],
                                  [40, 12],
                              ]
                            : []),
                    ]);
                    const selected = [];
                    for (const base of ["G", "-"]) {
                        view.paramRuntime.setValue("bases", {
                            type: "categories",
                            component: "color",
                            values: new Set([base]),
                        });
                        selected.push(
                            await read(
                                reverse
                                    ? [
                                          [last, 12],
                                          [80 - second, 12],
                                          [first, 12],
                                      ]
                                    : [
                                          [first, 12],
                                          [second, 12],
                                          [last, 12],
                                      ]
                            )
                        );
                    }
                    return { extent: scale.zoomExtent, pixels, selected };
                } finally {
                    api.finalize();
                    host.remove();
                }
            }

            return [
                [await render(false, false), await render(true, false)],
                [await render(false, true), await render(true, true)],
            ];
        }, setup);
        const red = [255, 0, 0, 255];
        const blue = [0, 0, 255, 255];
        const gray = [128, 128, 128, 255];
        const fadedBlue = [0, 0, 255, 128];
        const fadedRed = [255, 0, 0, 128];
        const fadedGray = [128, 128, 128, 128];
        const clear = [0, 0, 0, 0];
        const selected = [
            [fadedRed, blue, fadedGray],
            [fadedRed, fadedBlue, gray],
        ];
        const expected = (vertical) => [
            {
                extent: [9, 17],
                selected,
                pixels: [
                    red,
                    blue,
                    clear,
                    gray,
                    clear,
                    fadedGray,
                    fadedRed,
                    // The internal edges mix colors and preserve transparent cells.
                    ...(renderer === "webgl" && !vertical
                        ? [
                              [128, 0, 128, 255],
                              [0, 0, 255, 128],
                          ]
                        : []),
                ],
            },
            {
                extent: [9, 17],
                selected,
                pixels: [gray, clear, blue, red, clear, fadedRed, fadedGray],
            },
        ];
        expect(results).toEqual([expected(false), expected(true)]);
    });
}

/**
 * @param {Playwright} playwright
 * @param {string} baseURL
 * @param {RasterRenderer} renderer
 * @param {(page: import("playwright/test").Page, setup: {src: string, renderer: string, register: string}) => Promise<void>} check
 * @param {number} [deviceScaleFactor]
 */
async function withRasterPage(
    playwright,
    baseURL,
    renderer,
    check,
    deviceScaleFactor = 1
) {
    const browser = await launchRasterBrowser(playwright, renderer);
    try {
        const page = await browser.newPage({ deviceScaleFactor });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (
                /WGSL|Invalid ShaderModule|Invalid RenderPipeline/.test(
                    message.text()
                )
            )
                errors.push(message.text());
        });
        await page.route("**/raster-test", (route) =>
            route.fulfill({
                contentType: "text/html",
                body: "<body style='margin:0'><div id='plot'></div></body>",
            })
        );
        await page.goto(new URL("/raster-test", baseURL).href);
        await page.evaluate(() => {
            globalThis.readImagePixels = async (blob, points) => {
                const bitmap = await globalThis.createImageBitmap(blob);
                const context = new globalThis.OffscreenCanvas(
                    bitmap.width,
                    bitmap.height
                ).getContext("2d");
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                return points.map(([x, y]) =>
                    Array.from(context.getImageData(x, y, 1, 1).data)
                );
            };
            globalThis.readRasterPixels = async (api, points, background) => {
                const { blob } = await api.imageExport.raster({
                    pixelRatio: 1,
                    background,
                });
                return globalThis.readImagePixels(blob, points);
            };
            globalThis.readSvgRasterPixels = async (api, points) => {
                const { blob, rasterized } = await api.imageExport.svg({
                    background: null,
                    rasterization: { pixelRatio: 1 },
                });
                const svg = new globalThis.DOMParser().parseFromString(
                    await blob.text(),
                    "image/svg+xml"
                );
                const image = svg.querySelector("[data-rasterized] image");
                const png = await (
                    await globalThis.fetch(image.getAttribute("href"))
                ).blob();
                const x = Number(image.getAttribute("x"));
                const y = Number(image.getAttribute("y"));
                const pixels = await globalThis.readImagePixels(
                    png,
                    points.map(([px, py]) => [px - x, py - y])
                );
                return { pixels, rasterized, document: svg };
            };
        });
        try {
            await check(page, {
                src: coreSource,
                renderer,
                register: registrations[renderer],
            });
        } finally {
            expect(errors).toEqual([]);
        }
    } finally {
        await browser.close();
    }
}

/** @param {Playwright} playwright @param {RasterRenderer} renderer */
function launchRasterBrowser(playwright, renderer) {
    if (renderer !== "webgpu")
        return playwright.chromium.launch({ channel: "chrome" });
    const softwareWebGpu = process.platform === "linux";
    return playwright.chromium.launch({
        channel: "chrome",
        args: [
            "--enable-unsafe-webgpu",
            softwareWebGpu
                ? "--enable-features=Vulkan"
                : "--enable-features=WebGPU",
            "--ignore-gpu-blocklist",
            ...(softwareWebGpu
                ? [
                      "--use-angle=swiftshader",
                      "--enable-unsafe-swiftshader",
                      "--use-vulkan=swiftshader",
                      "--use-webgpu-adapter=swiftshader",
                      "--disable-vulkan-surface",
                  ]
                : process.platform === "darwin"
                  ? ["--use-angle=metal"]
                  : []),
        ],
    });
}
