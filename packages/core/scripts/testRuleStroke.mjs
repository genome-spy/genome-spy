import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

// Public Core embedding/export and picking: no substituted painter or shader.
await testRenderers(
    [{ deviceScaleFactor: 1 }, { deviceScaleFactor: 2 }],
    async (page, renderer, variant) => {
        const result = await page.evaluate(
            async ({ renderer, dpr }) => {
                const { embed } = await import("/index.js");
                await import("/rendering/webgpu/register.js");
                const values = [
                    {
                        x: 0.125,
                        x2: 0.875,
                        y: 0.25,
                        y2: 0.25,
                        size: 8,
                        width: 2,
                    },
                    {
                        x: 0.125,
                        x2: 0.875,
                        y: 0.5,
                        y2: 0.5,
                        size: 0.5 / dpr,
                        width: 2,
                    },
                    {
                        x: 0.125,
                        x2: 0.875,
                        y: 0.75,
                        y2: 0.75,
                        size: 8,
                        width: 0,
                    },
                    {
                        x: 0.125,
                        x2: 0.875,
                        y: 0.625,
                        y2: 0.625,
                        size: 0.5 / dpr,
                        width: 0.125 / dpr,
                    },
                ].map((row) => ({ ...row, ink: "blue" }));
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
                                                    value: channel.startsWith(
                                                        "y"
                                                    )
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
                        const raster = await api.imageExport.raster({
                            // Opaque export also verifies composition independently of PNG alpha encoding.
                            background: fa === 1 ? null : "white",
                            pixelRatio: dpr,
                        });
                        const vector = await api.imageExport.svg({
                            background: null,
                        });
                        const captures = [];
                        let narrowAlpha = 0;
                        let edge;
                        let capProfiles;
                        for (const { blob } of [raster, vector]) {
                            const image = new globalThis.Image();
                            const url = globalThis.URL.createObjectURL(blob);
                            try {
                                image.src = url;
                                await image.decode();
                                const canvas = new globalThis.OffscreenCanvas(
                                    80 * dpr,
                                    80 * dpr
                                );
                                const ctx = canvas.getContext("2d");
                                ctx.drawImage(image, 0, 0, 80 * dpr, 80 * dpr);
                                if (captures.length === 0) {
                                    if (frames.length === 0) {
                                        capProfiles = [50, 70].map((y) =>
                                            Array.from(
                                                ctx.getImageData(
                                                    20 * dpr - 5,
                                                    y * dpr,
                                                    10,
                                                    1
                                                ).data
                                            ).filter(
                                                (_, index) => index % 4 === 3
                                            )
                                        );
                                    }
                                    edge = Array.from(
                                        ctx.getImageData(
                                            40 * dpr,
                                            55 * dpr,
                                            1,
                                            10 * dpr
                                        ).data
                                    );
                                    const column = ctx.getImageData(
                                        40 * dpr,
                                        25 * dpr,
                                        1,
                                        10 * dpr
                                    ).data;
                                    for (let i = 3; i < column.length; i += 4)
                                        narrowAlpha += column[i] / 255;
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
                                        Array.from(
                                            ctx.getImageData(
                                                Math.floor(x * dpr),
                                                Math.floor(y * dpr),
                                                1,
                                                1
                                            ).data
                                        )
                                    )
                                );
                            } finally {
                                globalThis.URL.revokeObjectURL(url);
                            }
                        }
                        const hit = await api.views
                            .root()
                            .marks.pick({ x: 40, y: 55 });
                        frames.push({
                            alpha,
                            narrowAlpha,
                            fa,
                            common,
                            edge,
                            capProfiles,
                            captures,
                            picked: hit.status === "hit",
                            vector: await vector.blob.text(),
                        });
                    }
                    return frames;
                } finally {
                    api.finalize();
                }
            },
            { renderer, dpr: variant.deviceScaleFactor }
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
                assert(
                    expected.every(
                        (v, j) => Math.abs(v - fractional.edge[i + j]) <= 2
                    ),
                    `${renderer}: shared-edge composition`
                );
                checked++;
            }
            assert(checked > 0, `${renderer}: fractional shared-edge samples`);
        }

        for (const frame of result) {
            assert(
                !/<(?:image|filter)\b/.test(frame.vector),
                "SVG stays vector-only without filters"
            );
            if (frame.fa !== 1) {
                const expected =
                    renderer === "canvas"
                        ? [159, 96, 191, 255]
                        : [255, 191, 191, 255];
                assert(
                    frame.captures[0][0].every(
                        (v, i) => Math.abs(v - expected[i]) <= 2
                    ),
                    `${renderer}: paint/common opacity`
                );
                continue;
            }
            for (const [index, pixels] of frame.captures.entries()) {
                assert.deepEqual(
                    pixels[0],
                    [255, 0, 0, 255],
                    `${renderer}: nominal body`
                );
                assert.deepEqual(
                    pixels[1],
                    frame.alpha ? [0, 0, 255, 255] : [0, 0, 0, 0],
                    `${renderer}: outside band (${index})`
                );
                assert.deepEqual(
                    pixels[3],
                    [255, 0, 0, 255],
                    `${renderer}: zero-width border`
                );
                // Native Canvas intentionally omits complete butt/dash-end borders.
                const end =
                    renderer === "canvas" && index === 0
                        ? [0, 0, 0, 0]
                        : [0, 0, 255, 255];
                assert.deepEqual(
                    pixels[4],
                    end,
                    `${renderer}: finite butt border`
                );
                assert.deepEqual(
                    pixels[5],
                    end,
                    `${renderer}: dash-cut border`
                );
                assert.deepEqual(
                    pixels[6],
                    [0, 0, 0, 0],
                    `${renderer}: genuine dash gap`
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
