import { URL } from "node:url";
/* global console, structuredClone, document, requestAnimationFrame, DOMParser, AbortSignal, createImageBitmap, MouseEvent, setTimeout, clearTimeout */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testRenderers } from "./testRenderers.mjs";

const fixture = JSON.parse(
    await readFile(
        new URL(
            "../../../examples/core/marks/link/dendrogram-gaps.json",
            import.meta.url
        ),
        "utf8"
    )
);

await testRenderers(
    [
        { deviceScaleFactor: 2, reverse: false },
        { deviceScaleFactor: 2, reverse: true },
    ],
    async (page, renderer, { reverse }) => {
        const result = await page.evaluate(
            async ({ fixture, renderer, reverse }) => {
                const { embed } = await import("/index.js");
                document.body.replaceChildren();
                const host = document.createElement("div");
                host.style.width = "600px";
                host.style.height = "300px";
                document.body.append(host);
                delete fixture.height;
                fixture.padding = 0;
                // Keep the test host free of bound controls.
                delete fixture.params[0].bind;
                Object.assign(fixture.scales.y, {
                    name: "rows",
                    reverse,
                });
                const tree = fixture.hconcat[0];
                tree.params = [
                    {
                        name: "picked",
                        select: {
                            type: "point",
                            on: "click",
                            toggle: false,
                        },
                    },
                ];
                Object.assign(tree.mark, {
                    tooltip: false,
                    minPickingSize: 8,
                });
                tree.encoding.color = {
                    condition: {
                        param: "picked",
                        empty: false,
                        value: "red",
                    },
                    value: "#34495e",
                };
                tree.encoding.order = {
                    condition: {
                        param: "picked",
                        empty: false,
                        value: 1,
                    },
                    value: 0,
                };
                fixture.hconcat[1].params = [
                    {
                        name: "brush",
                        select: {
                            type: "interval",
                            encodings: ["y"],
                        },
                    },
                ];
                for (const child of fixture.hconcat) {
                    child.encoding.x.axis = null;
                    child.encoding.y.axis = null;
                }
                const errors = [];
                const api = await embed(host, fixture, {
                    renderer,
                    onError: (error) => errors.push(error.message),
                });
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
                await frame();
                const treeView = api.views.get({
                    scope: [],
                    view: "dendrogram",
                });
                const heatmapView = api.views.get({
                    scope: [],
                    view: "heatmap",
                });
                const states = [];
                for (const navigate of [false, true]) {
                    if (navigate) {
                        await api
                            .getScaleResolutionByName("rows")
                            .zoomTo([0.2, 2.8]);
                        host.style.height = "420px";
                        await frame();
                    }
                    const exported = await api.imageExport.svg();
                    const svg = new DOMParser().parseFromString(
                        await exported.blob.text(),
                        "image/svg+xml"
                    );
                    const paths = Array.from(
                        svg.querySelectorAll('[data-mark-type="link"] path')
                    );
                    const points = paths.map((path) =>
                        path
                            .getAttribute("d")
                            .match(/-?\d+(?:\.\d+)?/g)
                            .map(Number)
                    );
                    const rects = Array.from(
                        svg.querySelectorAll('[data-mark-type="rect"] rect')
                    );
                    const leafErrors = points.slice(0, 4).map((point, i) => {
                        const cell = rects[i * 4];
                        return Math.abs(
                            point[5] -
                                (+cell.getAttribute("y") +
                                    +cell.getAttribute("height") / 2)
                        );
                    });
                    const [sx, sy, ex, ey, tx, ty] = points.at(-1);
                    const probes = [
                        [sx + 0.5, (sy + ey) / 2],
                        [(ex + tx) / 2, ty],
                        [ex + 1, ey],
                    ];
                    const picks = [];
                    for (const [x, y] of probes) {
                        const pick = await treeView.marks.pick({
                            x,
                            y,
                        });
                        picks.push(
                            pick.status == "hit"
                                ? pick.hit.datum.targetId
                                : pick.status
                        );
                    }
                    const raster = await api.imageExport.raster({
                        background: null,
                        pixelRatio: 2,
                    });
                    const bitmap = await createImageBitmap(raster.blob);
                    const canvas = document.createElement("canvas");
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    const alpha = probes.map(
                        ([x, y]) =>
                            ctx.getImageData(
                                Math.floor(x * 2),
                                Math.floor(y * 2),
                                1,
                                1
                            ).data[3]
                    );
                    states.push({
                        leafErrors,
                        picks,
                        alpha,
                        paths: paths.length,
                        rasterBytes: raster.blob.size,
                        warnings: exported.warnings,
                    });
                }
                // The heatmap still accepts ordinary integer-row interval selections.
                heatmapView.params.get("brush").setValue({
                    type: "interval",
                    intervals: { y: [0, 2] },
                });
                const brush = heatmapView.params
                    .getSelection("brush")
                    .getValue();
                const bounds = api.views.getLayoutBounds(treeView);
                const svgBefore = await api.imageExport.svg();
                const parsed = new DOMParser().parseFromString(
                    await svgBefore.blob.text(),
                    "image/svg+xml"
                );
                const last = Array.from(
                    parsed.querySelectorAll('[data-mark-type="link"] path')
                )
                    .at(-1)
                    .getAttribute("d")
                    .match(/-?\d+(?:\.\d+)?/g)
                    .map(Number);
                await frame();
                const selectionApi = treeView.params.getSelection("picked");
                const selectionChanged = new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        unsubscribe();
                        reject(
                            new Error("Timed out waiting for edge selection")
                        );
                    }, 5000);
                    const unsubscribe = selectionApi.subscribe((snapshot) => {
                        if (snapshot.active) {
                            clearTimeout(timer);
                            unsubscribe();
                            resolve(snapshot);
                        }
                    });
                });
                const canvas = host.querySelector("canvas");
                const canvasBounds = canvas.getBoundingClientRect();
                canvas.dispatchEvent(
                    new MouseEvent("click", {
                        bubbles: true,
                        clientX: canvasBounds.left + (last[2] + last[4]) / 2,
                        clientY: canvasBounds.top + last[5],
                    })
                );
                await frame();
                const selected = await selectionChanged;
                api.params.get("shape").setValue("diagonal");
                await frame();
                const curved = await api.imageExport.svg();
                const curves =
                    (await curved.blob.text()).match(/ d="M [^"]* C /g)
                        ?.length ?? 0;
                api.params.get("shape").setValue("orthogonal");
                api.views.root().datasets.set("tree", []);
                await frame();
                const empty = await api.imageExport.svg();
                const emptyPaths = new DOMParser()
                    .parseFromString(await empty.blob.text(), "image/svg+xml")
                    .querySelectorAll('[data-mark-type="link"] path').length;
                api.views.root().datasets.set(
                    "tree",
                    fixture.datasets.tree.map((node) => ({
                        ...node,
                        height: node.height * 0.8,
                    }))
                );
                await frame();
                const restored = await api.imageExport.svg();
                const restoredPaths = new DOMParser()
                    .parseFromString(
                        await restored.blob.text(),
                        "image/svg+xml"
                    )
                    .querySelectorAll('[data-mark-type="link"] path').length;
                api.finalize();
                return {
                    states,
                    errors,
                    brush,
                    selected,
                    curves,
                    emptyPaths,
                    restoredPaths,
                    bounds,
                };
            },
            { fixture: structuredClone(fixture), renderer, reverse }
        );
        assert.deepEqual(result.errors, [], `${renderer}: loading errors`);
        for (const state of result.states) {
            assert.equal(state.paths, 6);
            assert.ok(
                state.leafErrors.every((error) => error < 0.11),
                `${renderer}: leaf alignment`
            );
            assert.ok(
                state.picks.every((id) =>
                    ["A", "B", "C", "D", "AB", "ABC"].includes(id)
                ),
                `${renderer}: picking ${JSON.stringify(state.picks)}`
            );
            assert.ok(
                state.alpha.every((alpha) => alpha > 0),
                `${renderer}: raster coverage ${state.alpha}`
            );
            assert.ok(state.rasterBytes > 100);
            assert.deepEqual(state.warnings, []);
        }
        assert.equal(result.brush.active, true);
        assert.equal(
            result.selected.active,
            true,
            `${renderer}: click selects an edge`
        );
        assert.equal(result.curves, 6);
        assert.equal(result.emptyPaths, 0);
        assert.equal(result.restoredPaths, 6);
        console.log(
            `${renderer}, reverse=${reverse}: shared rows, navigation, picking, selections, updates, and exports passed.`
        );
    }
);

const bandFixture = JSON.parse(
    await readFile(
        new URL(
            "../../../examples/docs/grammar/transform/dendrogram/clustered-heatmap-band.json",
            import.meta.url
        ),
        "utf8"
    )
);

await testRenderers(
    [
        { deviceScaleFactor: 2, reverse: false, hidden: false },
        { deviceScaleFactor: 2, reverse: true, hidden: false },
        { deviceScaleFactor: 2, reverse: true, hidden: true },
    ],
    async (page, renderer, { reverse, hidden }) => {
        const result = await page.evaluate(
            async ({ fixture, renderer, reverse, hidden }) => {
                const { embed } = await import("/index.js");
                document.body.replaceChildren();
                const host = document.createElement("div");
                host.style.width = "650px";
                host.style.height = "420px";
                document.body.append(host);
                delete fixture.spec.width;
                delete fixture.spec.height;
                fixture.spec.encoding.x.axis = null;
                fixture.spec.encoding.y.axis = null;
                fixture.spec.encoding.color.legend = null;
                fixture.scales.x.reverse = reverse;
                fixture.scales.y.reverse = reverse;
                fixture.params.push({ name: "shape", value: "orthogonal" });
                fixture.datasets = {
                    sampleNodes: fixture.surround.left[0].data.values,
                };
                fixture.surround.left[0].data = { name: "sampleNodes" };
                fixture.surround.left[0].visible = !hidden;
                fixture.surround.top[0].visible = !hidden;
                for (const tree of [
                    fixture.surround.left[0],
                    fixture.surround.top[0],
                ]) {
                    tree.params = [
                        {
                            name: "picked",
                            persist: false,
                            select: {
                                type: "point",
                                on: "click",
                                toggle: false,
                            },
                        },
                    ];
                    tree.mark.linkShape = { expr: "shape" };
                    tree.mark.tooltip = false;
                }
                const errors = [];
                const api = await embed(host, fixture, {
                    renderer,
                    onError: (error) => errors.push(error.message),
                });
                await api.awaitVisibleLazyData(AbortSignal.timeout(5000));
                errors.push(
                    ...api.dataLoading
                        .getSnapshot()
                        .filter((entry) => entry.status === "error")
                        .map((entry) => entry.error)
                );
                const frame = () =>
                    new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve)
                        )
                    );
                await frame();
                const states = [];
                const cells = fixture.spec.data.values;
                for (const state of ["initial", "resize", "reorder"]) {
                    if (state === "resize") {
                        host.style.width = "780px";
                        host.style.height = "510px";
                    } else if (state === "reorder") {
                        api.views.root().datasets.set(
                            "sampleNodes",
                            fixture.datasets.sampleNodes.map((node) =>
                                node.parent === "sCA"
                                    ? {
                                          ...node,
                                          childOrder: 1 - node.childOrder,
                                      }
                                    : node
                            )
                        );
                    }
                    await frame();
                    const exported = await api.imageExport.svg();
                    const svg = new DOMParser().parseFromString(
                        await exported.blob.text(),
                        "image/svg+xml"
                    );
                    const rects = Array.from(
                        svg.querySelectorAll('[data-name="matrix"] rect')
                    );
                    const leafErrors = [];
                    const joinErrors = [];
                    const picks = [];
                    const probes = [];
                    for (const [name, axis, field] of [
                        ["sampleTree", "y", "sample"],
                        ["geneTree", "x", "gene"],
                    ]) {
                        const paths = Array.from(
                            svg.querySelectorAll(
                                '[data-name="' + name + '"] path'
                            )
                        );
                        const ids =
                            name === "sampleTree"
                                ? fixture.datasets.sampleNodes
                                : fixture.surround.top[0].data.values;
                        const targets = ids.filter(
                            (node) => node.parent !== null
                        );
                        const positions = new Map();
                        for (const [i, path] of paths.entries()) {
                            const [sx, sy, , , tx, ty] = path
                                .getAttribute("d")
                                .match(/-?\d+(?:\.\d+)?/g)
                                .map(Number);
                            const node = targets[i];
                            for (const [id, point] of [
                                [node.parent, [sx, sy]],
                                [node.id, [tx, ty]],
                            ]) {
                                const previous = positions.get(id);
                                if (previous)
                                    joinErrors.push(
                                        Math.hypot(
                                            point[0] - previous[0],
                                            point[1] - previous[1]
                                        )
                                    );
                                positions.set(id, point);
                            }
                            if (node.height === 0) {
                                const cell =
                                    rects[
                                        cells.findIndex(
                                            (cell) =>
                                                cell[field] === node[field]
                                        )
                                    ];
                                const center =
                                    +cell.getAttribute(axis) +
                                    +cell.getAttribute(
                                        axis === "y" ? "height" : "width"
                                    ) /
                                        2;
                                leafErrors.push(
                                    Math.abs((axis === "y" ? ty : tx) - center)
                                );
                                const probe =
                                    axis === "y"
                                        ? [(sx + tx) / 2, ty]
                                        : [tx, (sy + ty) / 2];
                                probes.push(probe);
                                const pick = await api.views
                                    .get({ scope: [], view: name })
                                    .marks.pick({ x: probe[0], y: probe[1] });
                                picks.push(
                                    pick.status === "hit" &&
                                        pick.hit.datum.targetId === node.id
                                );
                            }
                        }
                    }
                    const raster = await api.imageExport.raster({
                        background: null,
                        pixelRatio: 2,
                    });
                    const bitmap = await createImageBitmap(raster.blob);
                    const canvas = document.createElement("canvas");
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    const coverage = probes.map(([x, y]) =>
                        ctx
                            .getImageData(
                                Math.round(x * 2) - 1,
                                Math.round(y * 2) - 1,
                                3,
                                3
                            )
                            .data.some((value, i) => i % 4 === 3 && value > 0)
                    );
                    states.push({
                        cells: rects.length,
                        leafErrors,
                        joinErrors,
                        picks,
                        coverage,
                        warnings: exported.warnings,
                    });
                }
                let selected = hidden;
                if (!hidden) {
                    const exported = await api.imageExport.svg();
                    const svg = new DOMParser().parseFromString(
                        await exported.blob.text(),
                        "image/svg+xml"
                    );
                    const [sx, , , , tx, ty] = svg
                        .querySelector('[data-name="sampleTree"] path')
                        .getAttribute("d")
                        .match(/-?\d+(?:\.\d+)?/g)
                        .map(Number);
                    const canvas = host.querySelector("canvas");
                    const bounds = canvas.getBoundingClientRect();
                    canvas.dispatchEvent(
                        new MouseEvent("click", {
                            bubbles: true,
                            clientX: bounds.left + (sx + tx) / 2,
                            clientY: bounds.top + ty,
                        })
                    );
                    await frame();
                    selected = api.views
                        .get({ scope: [], view: "sampleTree" })
                        .params.getSelection("picked")
                        .getValue().active;
                }
                api.params.get("shape").setValue("diagonal");
                await frame();
                const curved = await api.imageExport.svg();
                const curves =
                    (await curved.blob.text()).match(/ d="M [^"]* C /g)
                        ?.length ?? 0;
                const order = api.params.get("sampleOrder").getValue();
                api.finalize();
                return { states, errors, curves, order, selected };
            },
            { fixture: structuredClone(bandFixture), renderer, reverse, hidden }
        );
        assert.deepEqual(
            result.errors,
            [],
            `${renderer}: categorical loading errors`
        );
        assert.deepEqual(result.order, [
            "Sample A",
            "Sample C",
            "Sample D",
            "Sample B",
        ]);
        for (const state of result.states) {
            assert.equal(state.cells, 16);
            assert.equal(state.leafErrors.length, hidden ? 0 : 8);
            assert.ok(
                state.leafErrors.every((error) => error < 0.11),
                `${renderer}: categorical leaf alignment ${state.leafErrors}`
            );
            assert.ok(
                state.joinErrors.every((error) => error < 0.11),
                `${renderer}: categorical joins`
            );
            assert.ok(
                state.picks.every(Boolean),
                `${renderer}: categorical picking`
            );
            assert.ok(
                state.coverage.every(Boolean),
                `${renderer}: categorical GPU/raster coverage`
            );
            assert.deepEqual(state.warnings, []);
        }
        assert.equal(result.curves, hidden ? 0 : 12);
        assert.equal(
            result.selected,
            true,
            `${renderer}: categorical edge selection`
        );
        console.log(
            `${renderer}, reverse=${reverse}, hidden=${hidden}: categorical domains, both axes, updates, resize, picking, and exports passed.`
        );
    }
);
