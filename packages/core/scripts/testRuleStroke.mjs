import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

// Public Core embedding/export and picking: no substituted painter or shader.
await testRenderers(
    [{ deviceScaleFactor: 1 }, { deviceScaleFactor: 2 }],
    async (page, renderer, variant) => {
        await checkAlignment(page, renderer, variant.deviceScaleFactor);
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

/**
 * Exercise alignment updates through public Core rendering/export, not shader substitution.
 * @param {import("playwright").Page} page
 * @param {"canvas" | "webgl" | "webgpu"} renderer
 * @param {number} dpr
 */
async function checkAlignment(page, renderer, dpr) {
    const { frames, unionChecks, contours } = await page.evaluate(
        async ({ renderer, dpr }) => {
            const { embed } = await import("/index.js");
            const { RASTER_COORDINATE_OFFSET } =
                await import("/rendering/renderingConstants.js");
            await import("/rendering/webgpu/register.js");
            /** @param {Blob} blob @param {number[][]} points */
            async function capture(blob, points) {
                const image = new globalThis.Image(),
                    url = globalThis.URL.createObjectURL(blob);
                try {
                    image.src = url;
                    await image.decode();
                    const canvas = new globalThis.OffscreenCanvas(
                            80 * dpr,
                            80 * dpr
                        ),
                        ctx = canvas.getContext("2d");
                    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                    // Read the decoded export, never Core's rendering canvas.
                    const pixels = ctx.getImageData(
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    ).data;
                    return points.map(([x, y]) => {
                        const offset =
                            (Math.floor(y * dpr) * canvas.width +
                                Math.floor(x * dpr)) *
                            4;
                        return Array.from(pixels.subarray(offset, offset + 4));
                    });
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
                    data: { values: [{}] },
                    params: [
                        { name: "align", value: "outside" },
                        { name: "alpha", value: 1 },
                        { name: "common", value: 1 },
                        { name: "width", value: 6 },
                        { name: "body", value: 16 },
                    ],
                    mark: {
                        type: "rule",
                        size: { expr: "body" },
                        fill: "red",
                        stroke: "blue",
                        strokeWidth: { expr: "width" },
                        strokeAlign: { expr: "align" },
                        strokeOpacity: { expr: "alpha" },
                        opacity: { expr: "common" },
                    },
                    encoding: {
                        x: { value: 0.125 },
                        x2: { value: 0.875 },
                        y: { value: 0.5 },
                    },
                },
                { renderer }
            );
            try {
                const frames = [];
                for (const [alpha, common, width, body = 16] of [
                    [1, 1, 6],
                    [0.5, 0.5, 6],
                    [0, 1, 6],
                    [1, 1, 20],
                    [1, 1, 6, 0.5],
                ]) {
                    let cf = 0;
                    if (body < 1) {
                        api.getParam("body").setValue(body);
                        api.getParam("alpha").setValue(0);
                        await new Promise((resolve) =>
                            globalThis.requestAnimationFrame(() =>
                                globalThis.requestAnimationFrame(resolve)
                            )
                        );
                        const [control] = await capture(
                            (
                                await api.imageExport.raster({
                                    background: "white",
                                    pixelRatio: dpr,
                                })
                            ).blob,
                            [[40, 40]]
                        );
                        cf = 1 - control[1] / 255;
                    }
                    for (const align of ["inside", "center", "outside"]) {
                        for (const [name, value] of Object.entries({
                            alpha,
                            common,
                            width,
                            body,
                            align,
                        }))
                            api.getParam(name).setValue(value);
                        await new Promise((resolve) =>
                            globalThis.requestAnimationFrame(() =>
                                globalThis.requestAnimationFrame(resolve)
                            )
                        );
                        const exports = [
                            await api.imageExport.raster({
                                background: "white",
                                pixelRatio: dpr,
                            }),
                        ];
                        if (renderer === "canvas")
                            exports.push(
                                await api.imageExport.svg({
                                    background: "white",
                                })
                            );
                        const captures = [];
                        for (const { blob } of exports) {
                            captures.push(
                                await capture(blob, [
                                    [40, 33],
                                    [40, 40],
                                    [11, 40],
                                    [5, 40],
                                    ...(body < 1
                                        ? Array.from(
                                              { length: 32 * dpr },
                                              (_, i) => [40, 24 + i / dpr]
                                          )
                                        : []),
                                ])
                            );
                        }
                        const pick = await api.views
                            .root()
                            .marks.pick({ x: 40, y: 27 });
                        frames.push({
                            alpha,
                            common,
                            width,
                            body,
                            cf,
                            align,
                            captures,
                            picked: pick.status === "hit",
                        });
                    }
                }
                const unionChecks = [];
                const contours = [];
                // Independently classify every output pixel by nominal-boundary distance.
                // SVG may differ within one output pixel of a boundary; GPU internal
                // paint transitions must retain opaque coverage even in that region.
                /**
                 * @param {Blob} blob
                 * @param {(x: number, y: number) => number} distance
                 * @param {number} inset
                 * @param {number} outset
                 * @param {boolean} svg
                 * @param {number} [yMin]
                 */
                async function contour(
                    blob,
                    distance,
                    inset,
                    outset,
                    svg,
                    yMin = 0
                ) {
                    const points = Array.from(
                        { length: 80 * (80 - yMin) * dpr * dpr },
                        (_, i) => [
                            (i % (80 * dpr)) / dpr,
                            yMin + Math.floor(i / (80 * dpr)) / dpr,
                        ]
                    );
                    const pixels = await capture(blob, points);
                    const errors = [];
                    let checked = 0,
                        edgeInk = 0;
                    for (let i = 0; i < points.length; i++) {
                        const [x, y] = points[i],
                            d = distance(x + 0.5 / dpr, y + 0.5 / dpr),
                            pixel = pixels[i];
                        if (
                            !svg &&
                            d < outset - 1 / dpr &&
                            pixel[1] > 2 &&
                            errors.length < 3
                        )
                            errors.push([x, y, "internal seam", pixel]);
                        if (
                            Math.abs(d + inset) <= 1 / dpr ||
                            Math.abs(d - outset) <= 1 / dpr
                        )
                            continue;
                        const expected =
                            d < -inset
                                ? [255, 0, 0, 255]
                                : d < outset
                                  ? [0, 0, 255, 255]
                                  : [255, 255, 255, 255];
                        if (
                            pixel.some(
                                (v, c) => Math.abs(v - expected[c]) > 2
                            ) &&
                            errors.length < 3
                        )
                            errors.push([x, y, d, pixel, expected]);
                        checked++;
                        if (d < outset && (x < 2 || y < 2)) edgeInk++;
                    }
                    return { errors, checked, edgeInk };
                }
                // A diagonal square ribbon has a corner crossing the viewport edge.
                // The reference is an oriented rectangle's signed distance, not a rule path.
                const diagonal = await embed(
                    globalThis.document.body,
                    {
                        width: 80,
                        height: 80,
                        padding: 0,
                        config: {
                            background: null,
                            view: { stroke: null, strokeWidth: 0 },
                        },
                        data: { values: [{}] },
                        params: [{ name: "alignment", value: "inside" }],
                        mark: {
                            type: "rule",
                            size: 12,
                            fill: "red",
                            stroke: "blue",
                            strokeWidth: 4,
                            strokeCap: "square",
                            strokeAlign: { expr: "alignment" },
                            clip: true,
                        },
                        encoding: Object.fromEntries(
                            Object.entries({
                                x: 4 / 80,
                                x2: 66 / 80,
                                y: 1 - 6 / 80,
                                y2: 1 - 56 / 80,
                            }).map(([c, value]) => [c, { value }])
                        ),
                    },
                    { renderer }
                );
                try {
                    const length = Math.hypot(62, 50),
                        tx = 62 / length,
                        ty = 50 / length;
                    /** @type {(x: number, y: number) => number} */
                    const distance = (x, y) => {
                        // Preserve the existing GPU raster-coordinate translation.
                        if (renderer !== "canvas") {
                            x -= RASTER_COORDINATE_OFFSET;
                            y -= RASTER_COORDINATE_OFFSET;
                        }
                        const dx =
                            Math.abs((x - 4) * tx + (y - 6) * ty - length / 2) -
                            (length / 2 + 6);
                        const dy = Math.abs(-(x - 4) * ty + (y - 6) * tx) - 6;
                        return (
                            Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
                            Math.min(Math.max(dx, dy), 0)
                        );
                    };
                    for (const alignment of ["inside", "center"]) {
                        diagonal.getParam("alignment").setValue(alignment);
                        await new Promise((resolve) =>
                            globalThis.requestAnimationFrame(() =>
                                globalThis.requestAnimationFrame(resolve)
                            )
                        );
                        const svg = renderer === "canvas";
                        const exported = svg
                            ? await diagonal.imageExport.svg({
                                  background: "white",
                              })
                            : await diagonal.imageExport.raster({
                                  background: "white",
                                  pixelRatio: dpr,
                              });
                        const result = await contour(
                            exported.blob,
                            distance,
                            alignment === "inside" ? 4 : 2,
                            alignment === "inside" ? 0 : 2,
                            svg
                        );
                        contours.push({
                            name: "diagonal " + alignment,
                            ...result,
                        });
                        const hit = await diagonal.views
                            .root()
                            .marks.pick({ x: 1.5, y: 2.5 });
                        if (hit.status !== "hit")
                            throw new Error(
                                "clipped square cap must remain pickable"
                            );
                    }
                } finally {
                    diagonal.finalize();
                }
                if (renderer === "canvas") {
                    // Independent solid interiors must not acquire borders from overlapping dash caps.
                    const rule = {
                        type: "rule",
                        size: 8,
                        fill: "red",
                        stroke: "blue",
                        strokeWidth: 2,
                        strokeOpacity: 0.5,
                        strokeAlign: { expr: "alignment" },
                    };
                    const union = await embed(
                        globalThis.document.body,
                        {
                            width: 80,
                            height: 80,
                            padding: 0,
                            config: {
                                background: null,
                                view: { stroke: null, strokeWidth: 0 },
                            },
                            data: { values: [{}] },
                            params: [{ name: "alignment", value: "inside" }],
                            encoding: {
                                x: { value: 0.125 },
                                x2: { value: 0.875 },
                            },
                            layer: [
                                {
                                    mark: {
                                        ...rule,
                                        strokeCap: "square",
                                        strokeDash: [8, 2],
                                    },
                                    encoding: { y: { value: 0.75 } },
                                },
                                {
                                    mark: {
                                        ...rule,
                                        strokeOpacity: 1,
                                        strokeCap: "round",
                                        strokeDash: [0, 4],
                                    },
                                    encoding: { y: { value: 0.25 } },
                                },
                            ],
                        },
                        { renderer }
                    );
                    try {
                        // Circle-union distance is computed from exposed radial points
                        // and adjacent-circle intersections, independently of SVG arcs.
                        const centers = Array.from(
                            { length: 16 },
                            (_, i) => 10 + 4 * i
                        );
                        const vertices = centers.slice(1).flatMap((c) => [
                            [c - 2, 60 - Math.sqrt(12)],
                            [c - 2, 60 + Math.sqrt(12)],
                        ]);
                        /** @type {(x: number, y: number) => number} */
                        const distance = (x, y) => {
                            const inside = centers.some(
                                (c) => Math.hypot(x - c, y - 60) <= 4
                            );
                            let nearest = Math.min(
                                ...vertices.map(([vx, vy]) =>
                                    Math.hypot(x - vx, y - vy)
                                )
                            );
                            for (const c of centers) {
                                const r = Math.hypot(x - c, y - 60);
                                if (r === 0) continue;
                                const bx = c + (4 * (x - c)) / r,
                                    by = 60 + (4 * (y - 60)) / r;
                                if (
                                    centers.every(
                                        (other) =>
                                            Math.hypot(bx - other, by - 60) >=
                                            4 - 1e-8
                                    )
                                )
                                    nearest = Math.min(
                                        nearest,
                                        Math.hypot(x - bx, y - by)
                                    );
                            }
                            return inside ? -nearest : nearest;
                        };
                        for (const alignment of ["inside", "center"]) {
                            union.getParam("alignment").setValue(alignment);
                            await new Promise((resolve) =>
                                globalThis.requestAnimationFrame(() =>
                                    globalThis.requestAnimationFrame(resolve)
                                )
                            );
                            contours.push({
                                name: "round union " + alignment,
                                ...(await contour(
                                    (
                                        await union.imageExport.svg({
                                            background: "white",
                                        })
                                    ).blob,
                                    distance,
                                    alignment === "inside" ? 2 : 1,
                                    alignment === "inside" ? 0 : 1,
                                    true,
                                    40
                                )),
                            });
                            unionChecks.push(
                                ...(await capture(
                                    (
                                        await union.imageExport.svg({
                                            background: null,
                                        })
                                    ).blob,
                                    [
                                        [22, 20],
                                        [14, 60],
                                        [40, alignment === "inside" ? 17 : 16],
                                    ]
                                ))
                            );
                        }
                    } finally {
                        union.finalize();
                    }
                }
                return { frames, unionChecks, contours };
            } finally {
                api.finalize();
            }
        },
        { renderer, dpr }
    );
    for (const result of contours) {
        assert.deepEqual(
            result.errors,
            [],
            `${renderer}: ${result.name} contour at DPR ${dpr}`
        );
        assert(result.checked > 1000, `${renderer}: full contour coverage`);
        if (result.name.startsWith("diagonal"))
            assert(
                result.edgeInk > 0,
                `${renderer}: visible border at clipped viewport edge`
            );
    }
    for (let i = 0; i < unionChecks.length; i++) {
        const expected = i % 3 === 2 ? [128, 0, 128, 255] : [255, 0, 0, 255];
        assert(
            unionChecks[i].every((v, c) => Math.abs(v - expected[c]) <= 2),
            `SVG: dash union paint ${i}: ${unionChecks[i]} vs ${expected}`
        );
    }
    for (const frame of frames) {
        if (frame.body < 1) {
            // Use the original body export as the geometric coverage reference:
            // layout may snap the centerline. Inward paint cannot add coverage.
            if (renderer !== "canvas") {
                const cf = frame.cf;
                assert(
                    cf > 0 && cf < 1,
                    `${renderer}: fractional nominal coverage`
                );
                const expected =
                    frame.align === "inside"
                        ? [255 * (1 - cf), 255 * (1 - cf), 255, 255]
                        : frame.align === "center"
                          ? [0, 0, 255, 255]
                          : [255 * cf, 0, 255 * (1 - cf), 255];
                assert(
                    frame.captures[0][1].every(
                        (v, c) => Math.abs(v - expected[c]) <= 2
                    ),
                    `${renderer}/${frame.align}: thin aligned ribbon ${frame.captures[0][1]} vs ${expected}`
                );
            } else {
                const profile = frame.captures[1].slice(4);
                const extent =
                    0.25 + { inside: 0, center: 3, outside: 6 }[frame.align];
                assert(
                    profile.some((p) => p[2] > p[0] + 2),
                    "SVG: thin aligned stroke remains visible"
                );
                for (let i = 0; i < profile.length; i++) {
                    const distance = Math.abs(24 + (i + 0.5) / dpr - 40);
                    const expected =
                        distance > extent + 1 / dpr
                            ? [255, 255, 255, 255]
                            : distance > 0.25 + 1 / dpr &&
                                distance < extent - 1 / dpr
                              ? [0, 0, 255, 255]
                              : null;
                    if (expected)
                        assert(
                            profile[i].every(
                                (v, c) => Math.abs(v - expected[c]) <= 2
                            ),
                            `SVG/${frame.align}: thin profile ${i}: ${profile[i]} vs ${expected}`
                        );
                }
            }
            continue;
        }
        for (const [index, pixels] of frame.captures.entries()) {
            const native = renderer === "canvas" && index === 0;
            const inside = !native && frame.align !== "outside";
            const red = [255, 0, 0, 255],
                blue = [0, 0, 255, 255],
                white = [255, 255, 255, 255];
            let expected;
            if (frame.alpha === 0) expected = [red, red, red, white];
            else if (frame.common === 0.5) {
                // S over F inside the body, then common opacity once. Canvas keeps two native paints.
                const overlap = native
                    ? [223, 96, 128, 255]
                    : [191, 128, 191, 255];
                const fill = native
                    ? [223, 96, 128, 255]
                    : [255, 128, 128, 255];
                expected = [
                    inside ? overlap : fill,
                    fill,
                    inside ? overlap : fill,
                    !native && frame.align === "outside"
                        ? [191, 191, 255, 255]
                        : white,
                ];
            } else {
                expected = [
                    inside ? blue : red,
                    frame.width === 20 && inside ? blue : red,
                    inside ? blue : red,
                    !native &&
                    (frame.align === "outside" ||
                        (frame.width === 20 && frame.align === "center"))
                        ? blue
                        : white,
                ];
            }
            for (let i = 0; i < pixels.length; i++)
                assert(
                    pixels[i].every(
                        (v, c) => Math.abs(v - expected[i][c]) <= 2
                    ),
                    `${renderer}/${index}/${frame.align} alpha=${frame.alpha} width=${frame.width} sample=${i}: ${pixels[i]} vs ${expected[i]}`
                );
        }
        if (frame.width === 6)
            assert.equal(
                frame.picked,
                frame.alpha > 0 &&
                    (renderer === "canvas" || frame.align === "outside"),
                `${renderer}: alignment-dependent border picking`
            );
    }
}
