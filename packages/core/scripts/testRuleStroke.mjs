import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

// Public Core embedding/export and picking: no substituted painter or shader.
await testRenderers(
    [{ deviceScaleFactor: 1 }, { deviceScaleFactor: 2 }],
    async (page, renderer, variant) => {
        const result = await page.evaluate(renderFrames, {
            renderer,
            dpr: variant.deviceScaleFactor,
        });

        /**
         * @param {number[]} actual
         * @param {number[]} expected
         * @param {string} label
         */
        const near = (actual, expected, label) =>
            assert(
                actual.every((value, i) => Math.abs(value - expected[i]) <= 2),
                `${renderer}: ${label}: ${actual} vs ${expected}`
            );
        if (renderer !== "canvas") {
            const [rule, reference] = result[0].capProfiles;
            assert(
                rule.every((alpha, i) => Math.abs(alpha - reference[i]) <= 1),
                `${renderer}: nominal thin square-cap extent`
            );
        }

        // The horizontal DPR-2 fixture lands on pixel edges; DPR 1 exercises fractional coverage.
        if (renderer !== "canvas" && variant.deviceScaleFactor === 1) {
            let checked = 0;
            const [opaque, control, fractional] = result;
            for (let i = 0; i < control.edge.length; i += 4) {
                const cf = control.edge[i + 3] / 255;
                if (cf <= 0 || cf >= 1 || opaque.edge[i + 3] !== 255) continue;
                const a = 0.25 * cf + 0.5 * (1 - cf);
                const expected = [
                    255 * (0.25 * cf + 1 - a),
                    255 * (1 - a),
                    255 * (0.5 * (1 - cf) + 1 - a),
                    255,
                ];
                near(
                    fractional.edge.slice(i, i + 4),
                    expected,
                    "shared-edge composition"
                );
                checked++;
            }
            assert(checked > 0, `${renderer}: fractional shared-edge samples`);
        }

        for (const frame of result) {
            if (frame.fa !== 1) {
                const expected =
                    renderer === "canvas"
                        ? [159, 96, 191, 255]
                        : [255, 191, 191, 255];
                near(frame.captures[0][0], expected, "paint/common opacity");
                if (renderer === "canvas")
                    near(
                        frame.captures[1][0],
                        [255, 0, 0, 64],
                        "SVG paint/common opacity"
                    );
                continue;
            }
            for (const [index, pixels] of frame.captures.entries()) {
                // Native Canvas intentionally omits complete butt/dash-end borders.
                const red = [255, 0, 0, 255],
                    blue = [0, 0, 255, 255],
                    clear = [0, 0, 0, 0];
                const end = renderer === "canvas" && index === 0 ? clear : blue;
                for (const [sample, expected, label] of [
                    [0, red, "nominal body"],
                    [1, frame.alpha ? blue : clear, "outside band"],
                    [3, red, "zero-width border"],
                    [4, end, "finite butt border"],
                    [5, end, "dash-cut border"],
                    [6, clear, "genuine dash gap"],
                ])
                    assert.deepEqual(
                        pixels[sample],
                        expected,
                        `${renderer}: ${label}`
                    );
                if (frame.alpha && index === 0)
                    assert(
                        pixels[2][3] >= 250,
                        `${renderer}: thin-body opaque border`
                    );
            }
            if (renderer !== "canvas") {
                const expectedMass = frame.alpha ? 0.75 : 0.5;
                assert(
                    Math.abs(frame.narrowAlpha - expectedMass) <= 2 / 255,
                    `${renderer}: subpixel band coverage ${frame.narrowAlpha}`
                );
            }
            assert.equal(
                frame.picked,
                !!frame.alpha,
                `${renderer}: border-only picking`
            );
        }
    }
);

/** @param {{renderer: "canvas" | "webgl" | "webgpu", dpr: number}} options */
async function renderFrames({ renderer, dpr }) {
    const { embed } = await import("/index.js");
    await import("/rendering/webgpu/register.js");
    const values = [
        [0.25, 8, 2],
        [0.5, 0.5 / dpr, 2],
        [0.75, 8, 0],
        [0.625, 0.5 / dpr, 0.125 / dpr],
    ].map(([y, size, width]) => ({
        x: 0.125,
        x2: 0.875,
        y,
        y2: y,
        size,
        width,
        ink: "blue",
    }));
    /** @param {Blob} blob */
    async function capture(blob) {
        const image = new globalThis.Image();
        const url = globalThis.URL.createObjectURL(blob);
        try {
            image.src = url;
            await image.decode();
            const canvas = new globalThis.OffscreenCanvas(80 * dpr, 80 * dpr);
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            /**
             * @param {number} x
             * @param {number} y
             * @param {number} [width]
             * @param {number} [height]
             */
            const readPixels = (x, y, width = 1, height = 1) =>
                Array.from(context.getImageData(x, y, width, height).data);
            return readPixels;
        } finally {
            globalThis.URL.revokeObjectURL(url);
        }
    }
    const api = await embed(
        globalThis.document.body,
        {
            width: 80,
            height: 80,
            padding: 0,
            config: {
                background: null,
                view: { stroke: null, strokeWidth: 0 },
            },
            data: { values },
            params: [
                { name: "alpha", value: 1 },
                { name: "outline", select: { type: "point" } },
                { name: "fa", value: 1 },
                { name: "common", value: 1 },
            ],
            layer: [
                {
                    mark: {
                        type: "rule",
                        fill: "red",
                        stroke: "blue",
                        strokeOpacity: { expr: "alpha" },
                        fillOpacity: { expr: "fa" },
                        opacity: { expr: "common" },
                    },
                    encoding: {
                        stroke: {
                            condition: {
                                param: "outline",
                                field: "ink",
                                type: "nominal",
                                legend: null,
                                scale: {
                                    domain: ["blue"],
                                    range: ["blue"],
                                },
                            },
                            value: null,
                            legend: null,
                        },
                        ...Object.fromEntries(
                            ["x", "x2", "y", "y2"].map((field) => [
                                field,
                                {
                                    field,
                                    type: "quantitative",
                                    scale: null,
                                    axis: null,
                                },
                            ])
                        ),
                        size: {
                            field: "size",
                            type: "quantitative",
                            scale: null,
                            legend: null,
                        },
                        strokeWidth: {
                            field: "width",
                            type: "quantitative",
                            scale: null,
                            legend: null,
                        },
                    },
                },
                {
                    data: { values: [{}] },
                    mark: {
                        type: "rule",
                        size: 6,
                        fill: "red",
                        stroke: "blue",
                        strokeWidth: 2,
                        strokeDash: [8, 8],
                        strokeDashOffset: 2,
                    },
                    encoding: {
                        x: { value: 0.1 },
                        x2: { value: 0.9 },
                        y: { value: 0.875 },
                    },
                },
                // A square ribbon's outside offset is an independently rendered rounded rectangle.
                ...["rule", "rect"].map((type, index) => {
                    const y = 50 + index * 20;
                    const radius = 2.1 / dpr;
                    const positions =
                        type === "rule"
                            ? { x: 20, x2: 44, y, y2: y }
                            : {
                                  x: 20 - radius,
                                  x2: 44 + radius,
                                  y: y + radius,
                                  y2: y - radius,
                              };
                    return {
                        data: { values: [{}] },
                        mark:
                            type === "rule"
                                ? {
                                      type,
                                      size: 0.2 / dpr,
                                      fill: "blue",
                                      stroke: "blue",
                                      strokeWidth: 2 / dpr,
                                      strokeCap: "square",
                                  }
                                : {
                                      type,
                                      fill: "blue",
                                      stroke: null,
                                      cornerRadius: 2 / dpr,
                                  },
                        encoding: Object.fromEntries(
                            Object.entries(positions).map(
                                ([channel, value]) => [
                                    channel,
                                    {
                                        value: channel.startsWith("y")
                                            ? 1 - value / 80
                                            : value / 80,
                                    },
                                ]
                            )
                        ),
                    };
                }),
            ],
        },
        { renderer }
    );
    try {
        const frames = [];
        for (const [alpha, fa, common] of [
            [1, 1, 1],
            [0, 1, 1],
            [1, 0.5, 0.5],
        ]) {
            api.getParam("alpha").setValue(alpha);
            api.getParam("fa").setValue(fa);
            api.getParam("common").setValue(common);
            await new Promise((resolve) =>
                globalThis.requestAnimationFrame(() =>
                    globalThis.requestAnimationFrame(resolve)
                )
            );
            const images = [
                await api.imageExport.raster({
                    // Opaque export also verifies composition independently of PNG alpha encoding.
                    background: fa === 1 ? null : "white",
                    pixelRatio: dpr,
                }),
            ];
            // SVG is independent of the selected live backend; keep both DPR checks once.
            if (renderer === "canvas")
                images.push(await api.imageExport.svg({ background: null }));
            const captures = [];
            let narrowAlpha = 0,
                edge,
                capProfiles;
            for (const { blob } of images) {
                const pixels = await capture(blob);
                if (captures.length === 0) {
                    if (frames.length === 0)
                        capProfiles = [50, 70].map((y) =>
                            pixels(20 * dpr - 5, y * dpr, 10).filter(
                                (_, i) => i % 4 === 3
                            )
                        );
                    edge = pixels(40 * dpr, 55 * dpr, 1, 10 * dpr);
                    narrowAlpha = pixels(40 * dpr, 25 * dpr, 1, 10 * dpr)
                        .filter((_, i) => i % 4 === 3)
                        .reduce((sum, value) => sum + value / 255, 0);
                }
                captures.push(
                    [
                        [40, 60],
                        [40, 55],
                        [40, 39],
                        [40, 20],
                        [7, 10],
                        [15, 10],
                        [18, 10],
                    ].map(([x, y]) =>
                        pixels(Math.floor(x * dpr), Math.floor(y * dpr))
                    )
                );
            }
            const hit = await api.views.root().marks.pick({ x: 40, y: 55 });
            frames.push({
                alpha,
                narrowAlpha,
                fa,
                edge,
                capProfiles,
                captures,
                picked: hit.status === "hit",
            });
        }
        return frames;
    } finally {
        api.finalize();
    }
}
