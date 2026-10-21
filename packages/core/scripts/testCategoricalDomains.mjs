/* global console, document, requestAnimationFrame, DOMParser, AbortSignal, createImageBitmap, MouseEvent, WebGL2RenderingContext */

import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

await testRenderers(
    [
        { deviceScaleFactor: 1, type: "band", reverse: false, dataFirst: true },
        {
            deviceScaleFactor: 2,
            type: "point",
            reverse: true,
            dataFirst: false,
        },
    ],
    async (page, renderer, variant) => {
        const result = await page.evaluate(
            async ({ renderer, type, reverse, dataFirst }) => {
                const { embed } = await import("/index.js");
                document.body.replaceChildren();
                const host = document.createElement("div");
                host.style.width = "360px";
                host.style.height = "240px";
                document.body.append(host);
                const rows = [
                    { category: "a", y: 0.2 },
                    { category: "b", y: 0.5 },
                    { category: "c", y: 0.8 },
                ];
                const errors = [];
                let attributeUploads = 0;
                const bufferMethods = ["bufferData", "bufferSubData"];
                const originals = bufferMethods.map(
                    (method) => WebGL2RenderingContext.prototype[method]
                );
                if (renderer === "webgl") {
                    for (const [i, method] of bufferMethods.entries()) {
                        WebGL2RenderingContext.prototype[method] = function (
                            ...args
                        ) {
                            if (args[0] === this.ARRAY_BUFFER)
                                attributeUploads++;
                            return originals[i].apply(this, args);
                        };
                    }
                }
                const api = await embed(
                    host,
                    {
                        padding: 0,
                        params: [{ name: "order", value: [] }],
                        datasets: { categories: dataFirst ? rows : [] },
                        hconcat: [
                            {
                                width: 360,
                                height: 240,
                                scales: {
                                    x: {
                                        type,
                                        name: "categories",
                                        domain: { expr: "order" },
                                        reverse,
                                        padding: 0.3,
                                        align: 0.3,
                                    },
                                },
                                encoding: {
                                    x: {
                                        field: "category",
                                        type: "nominal",
                                        axis: null,
                                    },
                                },
                                layer: [
                                    {
                                        name: "points",
                                        params: [
                                            {
                                                name: "picked",
                                                select: {
                                                    type: "point",
                                                    toggle: false,
                                                },
                                            },
                                        ],
                                        data: { name: "categories" },
                                        mark: { type: "point", tooltip: false },
                                        encoding: {
                                            y: {
                                                field: "y",
                                                type: "quantitative",
                                                axis: null,
                                                scale: { domain: [0, 1] },
                                            },
                                            color: {
                                                field: "category",
                                                type: "nominal",
                                                legend: null,
                                                scale: {
                                                    domain: { expr: "order" },
                                                    range: [
                                                        "#ff0000",
                                                        "#0000ff",
                                                    ],
                                                },
                                            },
                                            size: {
                                                field: "category",
                                                type: "nominal",
                                                legend: null,
                                                scale: {
                                                    type: "ordinal",
                                                    domain: { expr: "order" },
                                                    range: [400, 1600],
                                                },
                                            },
                                            fillOpacity: {
                                                condition: {
                                                    param: "picked",
                                                    empty: false,
                                                    value: 1,
                                                },
                                                value: 0.5,
                                            },
                                        },
                                    },
                                    // A second retained mark uses the same positional map.
                                    {
                                        name: "peers",
                                        data: { name: "categories" },
                                        mark: {
                                            type: "point",
                                            size: 100,
                                            tooltip: false,
                                        },
                                        encoding: {
                                            y: { value: 0.95 },
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        renderer,
                        onError: (error) => errors.push(error.message),
                    }
                );
                await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
                errors.push(
                    ...api.dataLoading
                        .getSnapshot()
                        .filter((entry) => entry.status == "error")
                        .map((entry) => entry.error)
                );
                const frame = () =>
                    new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve)
                        )
                    );
                const view = api.views.get({ scope: [], view: "points" });
                const peer = api.views.get({ scope: [], view: "peers" });
                const scale = api
                    .getScaleResolutionByName("categories")
                    .getScale();
                const ids = () => {
                    const indexer = scale.props.domainIndexer;
                    const known = new Set(indexer.domain());
                    return rows.map((row) =>
                        known.has(row.category) ? indexer(row.category) : null
                    );
                };
                let initialIds;
                const states = [];

                const capture = async (domain) => {
                    await frame();
                    // SVG currently emits NaN geometry for missing categories;
                    // compare complete domains with SVG and membership with CPU scales.
                    const exported =
                        domain.length === rows.length
                            ? await api.imageExport.svg()
                            : null;
                    const circles = exported
                        ? Array.from(
                              new DOMParser()
                                  .parseFromString(
                                      await exported.blob.text(),
                                      "image/svg+xml"
                                  )
                                  .querySelectorAll("circle")
                          )
                        : [];
                    const raster = await api.imageExport.raster({
                        background: null,
                        pixelRatio: 1,
                    });
                    const bitmap = await createImageBitmap(raster.blob);
                    const canvas = document.createElement("canvas");
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    const probes = [];
                    for (const row of rows) {
                        const y = Math.round((1 - row.y) * 240);
                        const circle = circles.find(
                            (circle) =>
                                Math.abs(+circle.getAttribute("cy") - y) <
                                    0.1 &&
                                Number.isFinite(+circle.getAttribute("cx")) &&
                                Number.isFinite(+circle.getAttribute("r"))
                        );
                        const line = ctx.getImageData(
                            0,
                            y,
                            canvas.width,
                            1
                        ).data;
                        let left = canvas.width;
                        let right = -1;
                        for (let x = 0; x < canvas.width; x++) {
                            if (line[x * 4 + 3] > 20) {
                                left = Math.min(left, x);
                                right = x;
                            }
                        }
                        const active = domain.includes(row.category);
                        const expectedX = circle
                            ? +circle.getAttribute("cx")
                            : active
                              ? (scale(row.category) + scale.bandwidth() / 2) *
                                360
                              : null;
                        const center = active
                            ? Array.from(
                                  ctx.getImageData(
                                      Math.floor(expectedX),
                                      y,
                                      1,
                                      1
                                  ).data
                              )
                            : null;
                        const pick = active
                            ? await view.marks.pick({ x: expectedX, y })
                            : await view.marks.pick({ x: 180, y });
                        const sharedPick = active
                            ? await peer.marks.pick({ x: expectedX, y: 12 })
                            : null;
                        probes.push({
                            category: row.category,
                            active,
                            expectedX,
                            expectedRadius: circle
                                ? +circle.getAttribute("r")
                                : active
                                  ? [10, 20][domain.indexOf(row.category) % 2]
                                  : null,
                            fill:
                                circle?.getAttribute("fill") ??
                                (domain.indexOf(row.category) % 2
                                    ? "#0000ff"
                                    : "#ff0000"),
                            left,
                            right,
                            center,
                            pick:
                                pick.status == "hit"
                                    ? pick.hit.datum.category
                                    : pick.status,
                            sharedPick:
                                sharedPick?.status == "hit"
                                    ? sharedPick.hit.datum.category
                                    : sharedPick?.status,
                        });
                    }
                    states.push({
                        domain,
                        probes,
                        ids: ids(),
                        warnings: exported?.warnings ?? [],
                    });
                };

                await capture([]);
                // Discovery and explicit order deliberately disagree in both paths.
                api.params.get("order").setValue(["c", "a", "b"]);
                if (!dataFirst)
                    api.views.root().datasets.set("categories", rows);
                await capture(["c", "a", "b"]);
                initialIds = ids();
                const initialUploads = attributeUploads;
                api.params.get("order").setValue(["a", "b", "c"]);
                await capture(["a", "b", "c"]);
                api.params.get("order").setValue(["c", "a", "b"]);
                await capture(["c", "a", "b"]);
                api.params.get("order").setValue(["a", "c"]);
                await capture(["a", "c"]);
                api.params.get("order").setValue(["b"]);
                await capture(["b"]);
                api.params.get("order").setValue(["b", "c", "a"]);
                await capture(["b", "c", "a"]);

                const b = states.at(-1).probes[1];
                const canvas = host.querySelector("canvas");
                const bounds = canvas.getBoundingClientRect();
                canvas.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        clientX: bounds.left + b.expectedX,
                        clientY: bounds.top + 120,
                    })
                );
                await frame();
                api.params.get("order").setValue(["c", "a", "b"]);
                await capture(["c", "a", "b"]);
                const selection = view.params.getSelection("picked").getValue();
                api.finalize();
                if (renderer === "webgl") {
                    for (const [i, method] of bufferMethods.entries()) {
                        WebGL2RenderingContext.prototype[method] = originals[i];
                    }
                }
                const styleStates = [];
                const shapeStates = [];
                if (dataFirst) {
                    // Keep positions and size valid so missing styles cannot
                    // hide behind positional NaN culling.
                    const stylesApi = await embed(
                        host,
                        {
                            width: 360,
                            height: 240,
                            padding: 0,
                            params: [
                                { name: "colors", value: [] },
                                { name: "shapes", value: ["a", "b", "c"] },
                                { name: "gradient", value: 0 },
                                { name: "alpha", value: 1 },
                            ],
                            data: {
                                values: rows.map((row, i) => ({
                                    ...row,
                                    x: (i + 1) / 4,
                                })),
                            },
                            mark: {
                                type: "point",
                                size: 1600,
                                tooltip: false,
                                fillGradientStrength: { expr: "gradient" },
                                fillOpacity: { expr: "alpha" },
                            },
                            encoding: {
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    axis: null,
                                    scale: { domain: [0, 1] },
                                },
                                y: { value: 0.5 },
                                shape: {
                                    field: "category",
                                    type: "nominal",
                                    legend: null,
                                    scale: {
                                        domain: { expr: "shapes" },
                                        range: ["circle", "square"],
                                    },
                                },
                                color: {
                                    field: "category",
                                    type: "nominal",
                                    legend: null,
                                    scale: {
                                        domain: { expr: "colors" },
                                        range: ["#ff0000", "#0000ff"],
                                    },
                                },
                            },
                        },
                        {
                            renderer,
                            onError: (error) => errors.push(error.message),
                        }
                    );
                    await stylesApi.awaitVisibleLazyData(
                        AbortSignal.timeout(5000)
                    );
                    const readStylePixels = async () => {
                        await frame();
                        const raster = await stylesApi.imageExport.raster({
                            background: null,
                            pixelRatio: 1,
                        });
                        const bitmap = await createImageBitmap(raster.blob);
                        const canvas = document.createElement("canvas");
                        canvas.width = bitmap.width;
                        canvas.height = bitmap.height;
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(bitmap, 0, 0);
                        bitmap.close();
                        /** @param {number} x @param {number} y */
                        const pixel = (x, y) =>
                            Array.from(ctx.getImageData(x, y, 1, 1).data);
                        return {
                            colors: rows.map((row, i) =>
                                pixel((i + 1) * 90, 120)
                            ),
                            edges: rows.map((row, i) =>
                                pixel((i + 1) * 90 + 12, 120)
                            ),
                            corners: rows.map((row, i) =>
                                pixel((i + 1) * 90 + 18, 138)
                            ),
                        };
                    };
                    // Canvas ignores gradients; exercise both GPU paths without
                    // duplicating the otherwise identical style fixture.
                    for (const gradient of renderer === "canvas"
                        ? [0]
                        : [0, 1]) {
                        const opacity = gradient ? 0.5 : 1;
                        stylesApi.params.get("gradient").setValue(gradient);
                        stylesApi.params.get("alpha").setValue(opacity);
                        for (const domain of [
                            [],
                            ["a", "c"],
                            ["c", "a", "b"],
                        ]) {
                            stylesApi.params.get("colors").setValue(domain);
                            styleStates.push({
                                domain,
                                gradient,
                                opacity,
                                ...(await readStylePixels()),
                            });
                        }
                    }

                    stylesApi.params.get("colors").setValue(["a", "b", "c"]);
                    stylesApi.params.get("gradient").setValue(0);
                    stylesApi.params.get("alpha").setValue(1);
                    for (const domain of [
                        ["a", "b", "c"],
                        ["a", "c"],
                        [],
                        ["c", "b", "a"],
                    ]) {
                        stylesApi.params.get("shapes").setValue(domain);
                        const pixels = await readStylePixels();
                        const centerPick = await stylesApi.views
                            .root()
                            .marks.pick({ x: 180, y: 120 });
                        const cornerPick = await stylesApi.views
                            .root()
                            .marks.pick({ x: 198, y: 138 });
                        shapeStates.push({
                            domain,
                            ...pixels,
                            centerPick: centerPick.status,
                            cornerPick: cornerPick.status,
                        });
                    }
                    stylesApi.finalize();
                }
                return {
                    errors,
                    initialIds,
                    states,
                    selection,
                    initialUploads,
                    attributeUploads,
                    styleStates,
                    shapeStates,
                };
            },
            { renderer, ...variant }
        );
        const label = `${renderer}/${variant.type}`;
        assert.deepEqual(result.errors, [], `${label}: loading`);
        if (renderer !== "canvas") {
            assert.deepEqual(
                result.initialIds,
                variant.dataFirst ? [0, 1, 2] : [1, 2, 0],
                `${label}: initialization preserves discovery or explicit IDs`
            );
        }
        for (const state of result.states) {
            if (state.domain.length)
                assert.deepEqual(
                    state.ids,
                    result.initialIds,
                    `${label}: stable category IDs`
                );
            assert.deepEqual(state.warnings, [], `${label}: SVG warnings`);
            for (const probe of state.probes) {
                const message = `${label} ${JSON.stringify(state.domain)} ${probe.category}`;
                if (!probe.active) {
                    assert.equal(
                        probe.right,
                        -1,
                        `${message}: inactive raster`
                    );
                    assert.equal(
                        probe.pick,
                        "empty",
                        `${message}: inactive pick`
                    );
                    assert.equal(
                        probe.expectedX,
                        null,
                        `${message}: inactive SVG`
                    );
                    continue;
                }
                assert.equal(
                    probe.pick,
                    probe.category,
                    `${message}: picking identity`
                );
                assert.equal(
                    probe.sharedPick,
                    probe.category,
                    `${message}: shared scale identity`
                );
                assert.ok(
                    Math.abs(
                        (probe.left + probe.right + 1) / 2 - probe.expectedX
                    ) < 1.1,
                    `${message}: raster center ${probe.left},${probe.right} vs SVG ${probe.expectedX}`
                );
                assert.ok(
                    Math.abs(
                        (probe.right - probe.left + 1) / 2 -
                            probe.expectedRadius
                    ) < 1.1,
                    `${message}: ordinal size follows current range`
                );
                assert.deepEqual(
                    probe.center
                        .slice(0, 3)
                        .map((value) =>
                            Math.round(
                                (value /
                                    Math.max(...probe.center.slice(0, 3))) *
                                    255
                            )
                        ),
                    probe.fill == "#ff0000" ? [255, 0, 0] : [0, 0, 255],
                    `${message}: ordinal color follows current range with cycling`
                );
            }
        }
        assert.equal(
            result.attributeUploads,
            result.initialUploads,
            `${label}: domain changes retain GPU attributes`
        );
        assert.equal(
            result.selection.active,
            true,
            `${label}: click selection`
        );
        assert.equal(
            result.states.at(-1).probes[1].center[3],
            255,
            `${label}: selection survives reorder`
        );
        for (const state of result.styleStates) {
            for (const [i, category] of ["a", "b", "c"].entries()) {
                const color = state.colors[i];
                const slot = state.domain.indexOf(category);
                if (slot < 0) {
                    assert.equal(
                        color[3],
                        0,
                        `${label}: missing ordinal color ${category} is transparent`
                    );
                    assert.equal(
                        state.edges[i][3],
                        0,
                        `${label}: missing ordinal color ${category} has no gradient edge`
                    );
                } else if (state.gradient) {
                    for (const sample of [color, state.edges[i]]) {
                        assert.ok(
                            Math.abs(sample[3] - state.opacity * 255) <= 1,
                            `${label}: gradient preserves ordinal paint opacity`
                        );
                    }
                    assert.ok(
                        color.slice(0, 3).every((component) => component > 0),
                        `${label}: active ordinal paint has its white gradient center`
                    );
                } else {
                    assert.deepEqual(
                        color,
                        slot % 2 ? [0, 0, 255, 255] : [255, 0, 0, 255],
                        `${label}: restored ordinal color ${category}`
                    );
                }
            }
        }
        for (const state of result.shapeStates) {
            const slot = state.domain.indexOf("b");
            const square = slot >= 0 && slot % 2 === 1;
            assert.deepEqual(
                state.colors[1],
                [0, 0, 255, 255],
                `${label}: missing shape keeps opaque paint`
            );
            assert.deepEqual(
                state.corners[1],
                square ? [0, 0, 255, 255] : [0, 0, 0, 0],
                `${label}: missing shape uses the circle fallback`
            );
            assert.equal(
                state.centerPick,
                "hit",
                `${label}: missing shape keeps its center pick`
            );
            // Canvas picking uses bounds; GPU picking follows the painted shape.
            if (renderer !== "canvas") {
                assert.equal(
                    state.cornerPick,
                    square ? "hit" : "empty",
                    `${label}: picking follows fallback shape geometry`
                );
            }
        }
        console.log(
            `${label}: category updates, dense membership, initialization, ordinal cycling, shared scales, picking, and selection passed.`
        );
    }
);
